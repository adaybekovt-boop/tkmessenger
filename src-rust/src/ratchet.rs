// Double Ratchet — реализация Signal Protocol для Orbits P2P.
//
// Обеспечивает:
//   - Forward secrecy: каждое сообщение использует уникальный ключ,
//     выведенный из одноразовой симметричной цепочки (KDF chain).
//   - Break-in recovery: при получении нового DH-ключа от пира
//     root key продвигается через ECDH → HKDF.
//   - Out-of-order: пропущенные message keys кешируются (до MAX_SKIPPED).
//
// Криптографические примитивы:
//   - X25519 для Diffie-Hellman key exchange
//   - HKDF-SHA256 для KDF_RK (root key) и KDF_CK (chain key)
//   - AES-256-GCM для аутентифицированного шифрования сообщений
//
// Состояние (RatchetState) сериализуется через serde для передачи
// между WASM и JS.

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use hkdf::Hkdf;
use sha2::Sha256;
use serde::{Deserialize, Serialize};
use x25519_dalek::{PublicKey, StaticSecret};

// ─────────────────────────────────────────────────────────────
// Константы
// ─────────────────────────────────────────────────────────────

/// Максимальное количество кешированных пропущенных ключей.
const MAX_SKIPPED: usize = 100;

/// Максимум ключей, которые можно пропустить за один шаг расшифровки.
const MAX_SKIP_PER_STEP: u32 = 64;

/// Info-строка для KDF_RK (root key derivation).
const ROOT_INFO: &[u8] = b"orbits-ratchet-rk-v2";

/// Info-строка для KDF_CK (chain key derivation).
const CHAIN_INFO: &[u8] = b"orbits-ratchet-ck-v2";

// ─────────────────────────────────────────────────────────────
// Ошибки
// ─────────────────────────────────────────────────────────────

/// Перечисление всех возможных ошибок протокола.
#[derive(Debug)]
pub enum RatchetError {
    /// Невалидный размер ключа или входных данных.
    InvalidKeyLength(String),
    /// Невалидный заголовок сообщения (повреждён или неразборчив).
    InvalidHeader(String),
    /// Отправка невозможна — нужен DH ratchet step.
    NoSendChainKey,
    /// Превышен лимит пропущенных сообщений за один шаг.
    TooManySkipped,
    /// Возможный replay — номер сообщения позади текущего Nr.
    PossibleReplay,
    /// AES-GCM расшифровка не удалась (неверный ключ или tamper).
    DecryptionFailed,
    /// AES-GCM шифрование не удалось.
    EncryptionFailed,
    /// Ошибка HKDF.
    KdfError(String),
    /// Ошибка сериализации/десериализации.
    SerdeError(String),
}

impl std::fmt::Display for RatchetError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidKeyLength(msg) => write!(f, "Невалидный размер ключа: {}", msg),
            Self::InvalidHeader(msg) => write!(f, "Невалидный заголовок: {}", msg),
            Self::NoSendChainKey => write!(f, "Нет sendCk — нужен DH ratchet step"),
            Self::TooManySkipped => write!(f, "Слишком много пропущенных сообщений"),
            Self::PossibleReplay => write!(f, "Возможная replay-атака"),
            Self::DecryptionFailed => write!(f, "Ошибка расшифровки AES-GCM"),
            Self::EncryptionFailed => write!(f, "Ошибка шифрования AES-GCM"),
            Self::KdfError(msg) => write!(f, "Ошибка KDF: {}", msg),
            Self::SerdeError(msg) => write!(f, "Ошибка сериализации: {}", msg),
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Структуры данных
// ─────────────────────────────────────────────────────────────

/// Один кешированный message key для пропущенного сообщения.
/// Идентифицируется парой (dh_pub пира, номер сообщения в цепочке).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkippedKey {
    /// Base64 DH public key пира на момент этой цепочки.
    pub dh_pub: Vec<u8>,
    /// Номер сообщения (n) в этой цепочке.
    pub n: u32,
    /// 32-байтный message key.
    pub mk: Vec<u8>,
}

/// Заголовок сообщения — передаётся вместе с ciphertext.
/// Содержит текущий DH public key отправителя и счётчики цепочки.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Header {
    /// DH public key отправителя (32 байта X25519).
    pub dh_pub: Vec<u8>,
    /// Номер сообщения в текущей отправительской цепочке.
    pub n: u32,
    /// Длина предыдущей отправительской цепочки (для skipped keys).
    pub pn: u32,
}

/// Полное состояние Double Ratchet для одного пира.
///
/// Сериализуется в JSON для передачи между Rust (WASM) и JS.
/// При каждом encrypt/decrypt состояние мутируется.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RatchetState {
    /// Root key — продвигается при каждом DH ratchet step.
    pub root_key: Vec<u8>,

    /// Sending chain key (None у Bob до первого DH ratchet step).
    pub send_ck: Option<Vec<u8>>,

    /// Receiving chain key (None до первого получения от пира).
    pub recv_ck: Option<Vec<u8>>,

    /// Наш секретный X25519 ключ (32 байта).
    pub dh_secret: Vec<u8>,

    /// Наш публичный X25519 ключ (32 байта).
    pub dh_pub: Vec<u8>,

    /// Публичный X25519 ключ пира (None если ещё не получен).
    pub remote_dh_pub: Option<Vec<u8>>,

    /// Количество отправленных сообщений в текущей send chain.
    pub ns: u32,

    /// Количество полученных сообщений в текущей recv chain.
    pub nr: u32,

    /// Длина предыдущей send chain (для заголовка сообщений).
    pub pn: u32,

    /// Кеш пропущенных message keys.
    pub skipped: Vec<SkippedKey>,
}

// ─────────────────────────────────────────────────────────────
// KDF функции
// ─────────────────────────────────────────────────────────────

/// KDF_RK — продвижение root key через DH output.
///
/// Использует HKDF-SHA256:
///   - IKM = dh_output (результат X25519 DH)
///   - salt = текущий root_key
///   - info = ROOT_INFO
///   - выход: 64 байта → [new_root_key(32) | new_chain_key(32)]
///
/// Возвращает (new_root_key, new_chain_key).
fn kdf_rk(
    root_key: &[u8],
    dh_output: &[u8],
) -> Result<([u8; 32], [u8; 32]), RatchetError> {
    let hk = Hkdf::<Sha256>::new(Some(root_key), dh_output);
    let mut okm = [0u8; 64];
    hk.expand(ROOT_INFO, &mut okm)
        .map_err(|e| RatchetError::KdfError(format!("KDF_RK expand: {}", e)))?;

    let mut new_rk = [0u8; 32];
    let mut new_ck = [0u8; 32];
    new_rk.copy_from_slice(&okm[..32]);
    new_ck.copy_from_slice(&okm[32..64]);
    Ok((new_rk, new_ck))
}

/// KDF_CK — продвижение chain key.
///
/// Использует HKDF-SHA256:
///   - IKM = текущий chain_key
///   - salt = пустой
///   - info = CHAIN_INFO
///   - выход: 64 байта → [new_chain_key(32) | message_key(32)]
///
/// Возвращает (new_chain_key, message_key).
fn kdf_ck(chain_key: &[u8]) -> Result<([u8; 32], [u8; 32]), RatchetError> {
    let hk = Hkdf::<Sha256>::new(Some(&[]), chain_key);
    let mut okm = [0u8; 64];
    hk.expand(CHAIN_INFO, &mut okm)
        .map_err(|e| RatchetError::KdfError(format!("KDF_CK expand: {}", e)))?;

    let mut new_ck = [0u8; 32];
    let mut mk = [0u8; 32];
    new_ck.copy_from_slice(&okm[..32]);
    mk.copy_from_slice(&okm[32..64]);
    Ok((new_ck, mk))
}

// ─────────────────────────────────────────────────────────────
// X25519 DH helpers
// ─────────────────────────────────────────────────────────────

/// Генерирует новую пару X25519 ключей.
/// Возвращает (secret_bytes, public_bytes).
fn generate_dh_keypair() -> ([u8; 32], [u8; 32]) {
    let secret = StaticSecret::random_from_rng(rand::rngs::OsRng);
    let public = PublicKey::from(&secret);
    (secret.to_bytes(), public.to_bytes())
}

/// Вычисляет shared secret через X25519 DH.
fn dh_shared(my_secret: &[u8; 32], remote_pub: &[u8; 32]) -> [u8; 32] {
    let secret = StaticSecret::from(*my_secret);
    let public = PublicKey::from(*remote_pub);
    *secret.diffie_hellman(&public).as_bytes()
}

/// Конвертирует slice в массив [u8; 32].
fn to_32(bytes: &[u8]) -> Result<[u8; 32], RatchetError> {
    bytes
        .try_into()
        .map_err(|_| RatchetError::InvalidKeyLength(format!("ожидалось 32, получено {}", bytes.len())))
}

// ─────────────────────────────────────────────────────────────
// AES-256-GCM шифрование / расшифровка
// ─────────────────────────────────────────────────────────────

/// Шифрует plaintext с помощью message key (AES-256-GCM).
///
/// AAD (Additional Authenticated Data) = сериализованный заголовок,
/// чтобы привязать заголовок к ciphertext (защита от подмены).
///
/// Возвращает: nonce(12 байт) || ciphertext(включая 16-байтный тег).
fn aes_encrypt(
    message_key: &[u8; 32],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, RatchetError> {
    let cipher = Aes256Gcm::new_from_slice(message_key)
        .map_err(|_| RatchetError::EncryptionFailed)?;

    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes)
        .map_err(|_| RatchetError::EncryptionFailed)?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let payload = aes_gcm::aead::Payload { msg: plaintext, aad };
    let ct = cipher
        .encrypt(nonce, payload)
        .map_err(|_| RatchetError::EncryptionFailed)?;

    // nonce || ciphertext
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Расшифровывает ciphertext с помощью message key (AES-256-GCM).
///
/// Входной формат: nonce(12 байт) || ciphertext.
fn aes_decrypt(
    message_key: &[u8; 32],
    encrypted: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, RatchetError> {
    if encrypted.len() < 13 {
        return Err(RatchetError::DecryptionFailed);
    }

    let (nonce_bytes, ct) = encrypted.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(message_key)
        .map_err(|_| RatchetError::DecryptionFailed)?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let payload = aes_gcm::aead::Payload { msg: ct, aad };
    cipher
        .decrypt(nonce, payload)
        .map_err(|_| RatchetError::DecryptionFailed)
}

// ─────────────────────────────────────────────────────────────
// Заголовок: сериализация / десериализация
// ─────────────────────────────────────────────────────────────

/// Сериализует заголовок в байты (JSON).
fn encode_header(header: &Header) -> Result<Vec<u8>, RatchetError> {
    serde_json::to_vec(header).map_err(|e| RatchetError::SerdeError(e.to_string()))
}

/// Десериализует заголовок из байт (JSON).
fn decode_header(data: &[u8]) -> Result<Header, RatchetError> {
    serde_json::from_slice(data).map_err(|e| RatchetError::InvalidHeader(e.to_string()))
}

// ─────────────────────────────────────────────────────────────
// Skipped keys management
// ─────────────────────────────────────────────────────────────

/// Ищет и извлекает skipped message key для данного заголовка.
/// Если найден — удаляет из кеша и возвращает Some(mk).
fn try_skipped_key(state: &mut RatchetState, header: &Header) -> Option<[u8; 32]> {
    let pos = state.skipped.iter().position(|sk| {
        sk.dh_pub == header.dh_pub && sk.n == header.n
    });
    if let Some(i) = pos {
        let sk = state.skipped.remove(i);
        let mut mk = [0u8; 32];
        if sk.mk.len() == 32 {
            mk.copy_from_slice(&sk.mk);
            Some(mk)
        } else {
            None
        }
    } else {
        None
    }
}

/// Пропускает ключи в receive chain до номера `until`.
/// Пропущенные message keys сохраняются в skipped кеш.
fn skip_recv_keys(state: &mut RatchetState, until: u32) -> Result<(), RatchetError> {
    let recv_ck = match &state.recv_ck {
        Some(ck) => ck.clone(),
        None => return Ok(()),
    };

    if until < state.nr {
        return Err(RatchetError::PossibleReplay);
    }
    if until - state.nr > MAX_SKIP_PER_STEP {
        return Err(RatchetError::TooManySkipped);
    }

    let remote_pub = state.remote_dh_pub.clone().unwrap_or_default();
    let mut ck = to_32(&recv_ck)?;

    while state.nr < until {
        let (new_ck, mk) = kdf_ck(&ck)?;

        state.skipped.push(SkippedKey {
            dh_pub: remote_pub.clone(),
            n: state.nr,
            mk: mk.to_vec(),
        });
        ck = new_ck;
        state.nr += 1;

        // Обрезаем кеш до MAX_SKIPPED (удаляем самые старые).
        while state.skipped.len() > MAX_SKIPPED {
            state.skipped.remove(0);
        }
    }

    state.recv_ck = Some(ck.to_vec());
    Ok(())
}

// ─────────────────────────────────────────────────────────────
// DH ratchet step
// ─────────────────────────────────────────────────────────────

/// Выполняет DH ratchet step при получении нового remote DH pub.
///
/// 1. Вычисляет ECDH с текущим нашим DH secret и новым remote pub → recv chain.
/// 2. Генерирует новую DH пару.
/// 3. Вычисляет ECDH с новым секретом и remote pub → send chain.
/// 4. Обновляет все поля state.
fn dh_ratchet_step(
    state: &mut RatchetState,
    new_remote_dh_pub: &[u8; 32],
) -> Result<(), RatchetError> {
    let prev_pn = state.ns;

    // Шаг 1: derive recv chain key
    let my_secret = to_32(&state.dh_secret)?;
    let dh_recv = dh_shared(&my_secret, new_remote_dh_pub);
    let rk = to_32(&state.root_key)?;
    let (new_rk_a, recv_ck) = kdf_rk(&rk, &dh_recv)?;

    // Шаг 2: генерируем новую DH пару
    let (new_secret, new_pub) = generate_dh_keypair();

    // Шаг 3: derive send chain key
    let dh_send = dh_shared(&new_secret, new_remote_dh_pub);
    let (new_rk_b, send_ck) = kdf_rk(&new_rk_a, &dh_send)?;

    // Шаг 4: обновляем состояние
    state.root_key = new_rk_b.to_vec();
    state.recv_ck = Some(recv_ck.to_vec());
    state.send_ck = Some(send_ck.to_vec());
    state.dh_secret = new_secret.to_vec();
    state.dh_pub = new_pub.to_vec();
    state.remote_dh_pub = Some(new_remote_dh_pub.to_vec());
    state.pn = prev_pn;
    state.ns = 0;
    state.nr = 0;

    Ok(())
}

// ─────────────────────────────────────────────────────────────
// Инициализация
// ─────────────────────────────────────────────────────────────

/// Инициализация Alice.
///
/// Alice знает DH public key Bob'а. Она сразу может выполнить
/// DH ratchet step и начать отправлять зашифрованные сообщения.
///
/// # Аргументы
/// - `shared_secret` — 32-байтный общий секрет (из начального обмена).
/// - `remote_dh_pub` — 32-байтный X25519 публичный ключ Bob'а.
pub fn ratchet_init_alice(
    shared_secret: &[u8],
    remote_dh_pub: &[u8],
) -> Result<RatchetState, RatchetError> {
    let ss = to_32(shared_secret)?;
    let remote = to_32(remote_dh_pub)?;

    // Генерируем DH пару для Alice
    let (dh_secret, dh_pub) = generate_dh_keypair();

    // DH → KDF_RK: derive send chain
    let dh_output = dh_shared(&dh_secret, &remote);
    let (root_key, send_ck) = kdf_rk(&ss, &dh_output)?;

    Ok(RatchetState {
        root_key: root_key.to_vec(),
        send_ck: Some(send_ck.to_vec()),
        recv_ck: None,
        dh_secret: dh_secret.to_vec(),
        dh_pub: dh_pub.to_vec(),
        remote_dh_pub: Some(remote.to_vec()),
        ns: 0,
        nr: 0,
        pn: 0,
        skipped: Vec::new(),
    })
}

/// Инициализация Bob.
///
/// Bob уже имеет свою DH пару (которую Alice знает). Он не может
/// отправлять до получения первого сообщения от Alice, которое
/// триггерит DH ratchet step.
///
/// # Аргументы
/// - `shared_secret` — 32-байтный общий секрет.
/// - `dh_secret` — 32-байтный X25519 секретный ключ Bob'а.
/// - `dh_pub` — 32-байтный X25519 публичный ключ Bob'а.
pub fn ratchet_init_bob(
    shared_secret: &[u8],
    dh_secret_bytes: &[u8],
    dh_pub_bytes: &[u8],
) -> Result<RatchetState, RatchetError> {
    let ss = to_32(shared_secret)?;
    let secret = to_32(dh_secret_bytes)?;
    let public = to_32(dh_pub_bytes)?;

    Ok(RatchetState {
        root_key: ss.to_vec(),
        send_ck: None,
        recv_ck: None,
        dh_secret: secret.to_vec(),
        dh_pub: public.to_vec(),
        remote_dh_pub: None,
        ns: 0,
        nr: 0,
        pn: 0,
        skipped: Vec::new(),
    })
}

// ─────────────────────────────────────────────────────────────
// Шифрование
// ─────────────────────────────────────────────────────────────

/// Шифрует plaintext и продвигает send chain.
///
/// Возвращает (header_bytes, ciphertext_bytes).
/// Header сериализован в JSON.
/// Ciphertext = nonce(12) || AES-256-GCM(plaintext, aad=header).
///
/// Мутирует state: sendCk продвигается, Ns увеличивается.
pub fn ratchet_encrypt(
    state: &mut RatchetState,
    plaintext: &[u8],
) -> Result<(Vec<u8>, Vec<u8>), RatchetError> {
    let send_ck = state
        .send_ck
        .as_ref()
        .ok_or(RatchetError::NoSendChainKey)?;

    // Derive message key из chain key
    let ck_arr = to_32(send_ck)?;
    let (new_ck, mk) = kdf_ck(&ck_arr)?;

    // Формируем заголовок с текущим DH pub и счётчиком
    let header = Header {
        dh_pub: state.dh_pub.clone(),
        n: state.ns,
        pn: state.pn,
    };
    let header_bytes = encode_header(&header)?;

    // AES-256-GCM шифрование с AAD = header
    let ciphertext = aes_encrypt(&mk, plaintext, &header_bytes)?;

    // Обновляем состояние
    state.send_ck = Some(new_ck.to_vec());
    state.ns += 1;

    Ok((header_bytes, ciphertext))
}

// ─────────────────────────────────────────────────────────────
// Расшифровка
// ─────────────────────────────────────────────────────────────

/// Расшифровывает ciphertext и продвигает recv chain.
///
/// # Логика:
/// 1. Проверяем skipped keys (out-of-order сообщения).
/// 2. Если DH pub отправителя изменился → DH ratchet step.
/// 3. Пропускаем ключи до номера `header.n`.
/// 4. Derive message key → расшифровка.
///
/// Мутирует state.
pub fn ratchet_decrypt(
    state: &mut RatchetState,
    header_bytes: &[u8],
    ciphertext: &[u8],
) -> Result<Vec<u8>, RatchetError> {
    let header = decode_header(header_bytes)?;

    // 1. Проверяем skipped keys
    if let Some(mk) = try_skipped_key(state, &header) {
        return aes_decrypt(&mk, ciphertext, header_bytes);
    }

    // 2. Если DH pub изменился — DH ratchet step
    let remote_changed = match &state.remote_dh_pub {
        Some(existing) => existing != &header.dh_pub,
        None => true,
    };

    if remote_changed {
        let new_remote = to_32(&header.dh_pub)?;

        // Пропускаем хвост предыдущей recv chain (до header.pn)
        if state.recv_ck.is_some() {
            skip_recv_keys(state, header.pn)?;
        }

        // Выполняем DH ratchet step
        dh_ratchet_step(state, &new_remote)?;
    }

    // 3. Пропускаем ключи в текущей recv chain до header.n
    skip_recv_keys(state, header.n)?;

    // 4. Derive message key
    let recv_ck = state
        .recv_ck
        .as_ref()
        .ok_or(RatchetError::DecryptionFailed)?;
    let ck_arr = to_32(recv_ck)?;
    let (new_ck, mk) = kdf_ck(&ck_arr)?;

    state.recv_ck = Some(new_ck.to_vec());
    state.nr += 1;

    // 5. Расшифровка
    aes_decrypt(&mk, ciphertext, header_bytes)
}

// ─────────────────────────────────────────────────────────────
// Тесты
// ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Генерирует общий секрет для тестов.
    fn test_shared_secret() -> [u8; 32] {
        let mut ss = [0u8; 32];
        getrandom::getrandom(&mut ss).unwrap();
        ss
    }

    #[test]
    fn test_alice_bob_basic() {
        // Bob генерирует DH пару
        let (bob_secret, bob_pub) = generate_dh_keypair();
        let shared = test_shared_secret();

        // Инициализация
        let mut alice = ratchet_init_alice(&shared, &bob_pub).unwrap();
        let mut bob = ratchet_init_bob(&shared, &bob_secret, &bob_pub).unwrap();

        // Alice → Bob
        let msg = b"Hello, Bob!";
        let (header, ct) = ratchet_encrypt(&mut alice, msg).unwrap();
        let pt = ratchet_decrypt(&mut bob, &header, &ct).unwrap();
        assert_eq!(pt, msg);

        // Bob → Alice
        let msg2 = b"Hello, Alice!";
        let (header2, ct2) = ratchet_encrypt(&mut bob, msg2).unwrap();
        let pt2 = ratchet_decrypt(&mut alice, &header2, &ct2).unwrap();
        assert_eq!(pt2, msg2);
    }

    #[test]
    fn test_multiple_messages() {
        let (bob_secret, bob_pub) = generate_dh_keypair();
        let shared = test_shared_secret();

        let mut alice = ratchet_init_alice(&shared, &bob_pub).unwrap();
        let mut bob = ratchet_init_bob(&shared, &bob_secret, &bob_pub).unwrap();

        // Alice отправляет 5 сообщений подряд
        let mut encrypted = Vec::new();
        for i in 0..5 {
            let msg = format!("Message {}", i);
            let (h, ct) = ratchet_encrypt(&mut alice, msg.as_bytes()).unwrap();
            encrypted.push((h, ct, msg));
        }

        // Bob расшифровывает все по порядку
        for (h, ct, expected) in &encrypted {
            let pt = ratchet_decrypt(&mut bob, h, ct).unwrap();
            assert_eq!(pt, expected.as_bytes());
        }
    }

    #[test]
    fn test_out_of_order() {
        let (bob_secret, bob_pub) = generate_dh_keypair();
        let shared = test_shared_secret();

        let mut alice = ratchet_init_alice(&shared, &bob_pub).unwrap();
        let mut bob = ratchet_init_bob(&shared, &bob_secret, &bob_pub).unwrap();

        // Alice отправляет 3 сообщения
        let (h0, ct0) = ratchet_encrypt(&mut alice, b"msg0").unwrap();
        let (h1, ct1) = ratchet_encrypt(&mut alice, b"msg1").unwrap();
        let (h2, ct2) = ratchet_encrypt(&mut alice, b"msg2").unwrap();

        // Bob получает в обратном порядке: 2, 0, 1
        let pt2 = ratchet_decrypt(&mut bob, &h2, &ct2).unwrap();
        assert_eq!(pt2, b"msg2");

        let pt0 = ratchet_decrypt(&mut bob, &h0, &ct0).unwrap();
        assert_eq!(pt0, b"msg0");

        let pt1 = ratchet_decrypt(&mut bob, &h1, &ct1).unwrap();
        assert_eq!(pt1, b"msg1");
    }

    #[test]
    fn test_ping_pong() {
        let (bob_secret, bob_pub) = generate_dh_keypair();
        let shared = test_shared_secret();

        let mut alice = ratchet_init_alice(&shared, &bob_pub).unwrap();
        let mut bob = ratchet_init_bob(&shared, &bob_secret, &bob_pub).unwrap();

        // Многораундовый обмен (пинг-понг)
        for round in 0..10 {
            let msg_a = format!("Alice round {}", round);
            let (h, ct) = ratchet_encrypt(&mut alice, msg_a.as_bytes()).unwrap();
            let pt = ratchet_decrypt(&mut bob, &h, &ct).unwrap();
            assert_eq!(pt, msg_a.as_bytes());

            let msg_b = format!("Bob round {}", round);
            let (h2, ct2) = ratchet_encrypt(&mut bob, msg_b.as_bytes()).unwrap();
            let pt2 = ratchet_decrypt(&mut alice, &h2, &ct2).unwrap();
            assert_eq!(pt2, msg_b.as_bytes());
        }
    }

    #[test]
    fn test_serialization() {
        let (bob_secret, bob_pub) = generate_dh_keypair();
        let shared = test_shared_secret();

        let mut alice = ratchet_init_alice(&shared, &bob_pub).unwrap();
        let mut bob = ratchet_init_bob(&shared, &bob_secret, &bob_pub).unwrap();

        // Первое сообщение
        let (h, ct) = ratchet_encrypt(&mut alice, b"test").unwrap();
        let _ = ratchet_decrypt(&mut bob, &h, &ct).unwrap();

        // Сериализуем и десериализуем состояние Alice
        let json = serde_json::to_string(&alice).unwrap();
        let mut alice_restored: RatchetState = serde_json::from_str(&json).unwrap();

        // Отправляем ещё одно сообщение из восстановленного состояния
        let (h2, ct2) = ratchet_encrypt(&mut alice_restored, b"after restore").unwrap();
        let pt2 = ratchet_decrypt(&mut bob, &h2, &ct2).unwrap();
        assert_eq!(pt2, b"after restore");
    }

    #[test]
    fn test_tampered_ciphertext() {
        let (bob_secret, bob_pub) = generate_dh_keypair();
        let shared = test_shared_secret();

        let mut alice = ratchet_init_alice(&shared, &bob_pub).unwrap();
        let mut bob = ratchet_init_bob(&shared, &bob_secret, &bob_pub).unwrap();

        let (h, mut ct) = ratchet_encrypt(&mut alice, b"secret").unwrap();

        // Портим ciphertext
        if let Some(last) = ct.last_mut() {
            *last ^= 0xFF;
        }

        // Расшифровка должна провалиться
        assert!(ratchet_decrypt(&mut bob, &h, &ct).is_err());
    }
}
