// drop_engine.rs — Rust-движок для Orbits Drop (P2P file transfer).
//
// Реализует:
//   - SHA-256 streaming hash файлов (в 4MB чанках)
//   - Нарезка файлов на чанки для передачи
//   - Сборка чанков обратно в файл
//
// Замена drop.worker.js — тяжёлые операции выполняются в WASM
// вместо Web Worker, что быстрее для хеширования и нарезки.

use sha2::{Digest, Sha256};

// ─────────────────────────────────────────────────────────────
// SHA-256 streaming hash
// ─────────────────────────────────────────────────────────────

/// Потоковый SHA-256 хешер.
///
/// Принимает данные порциями (update), затем finalize → hex hash.
/// Эффективнее, чем загружать весь файл целиком.
pub struct StreamHasher {
    hasher: Sha256,
    bytes_hashed: u64,
}

impl StreamHasher {
    pub fn new() -> Self {
        Self {
            hasher: Sha256::new(),
            bytes_hashed: 0,
        }
    }

    /// Добавляет порцию данных в хеш.
    pub fn update(&mut self, chunk: &[u8]) {
        self.hasher.update(chunk);
        self.bytes_hashed += chunk.len() as u64;
    }

    /// Возвращает количество обработанных байт.
    pub fn bytes_hashed(&self) -> u64 {
        self.bytes_hashed
    }

    /// Завершает хеширование и возвращает hex-строку.
    pub fn finalize(self) -> String {
        let hash = self.hasher.finalize();
        hex_encode(&hash)
    }
}

/// SHA-256 хеш всего буфера целиком → hex.
pub fn sha256_buffer(data: &[u8]) -> String {
    let hash = Sha256::digest(data);
    hex_encode(&hash)
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

// ─────────────────────────────────────────────────────────────
// Chunking
// ─────────────────────────────────────────────────────────────

/// Описание одного чанка файла.
#[derive(Debug, Clone)]
pub struct ChunkMeta {
    /// Порядковый номер чанка (0-based).
    pub seq: u32,
    /// Смещение от начала файла (в байтах).
    pub offset: u64,
    /// Размер чанка (в байтах).
    pub size: u32,
}

/// Вычисляет метаданные всех чанков для файла заданного размера.
///
/// Используется для планирования передачи: сколько чанков, их смещения.
pub fn compute_chunk_metas(file_size: u64, chunk_size: u32) -> Vec<ChunkMeta> {
    if file_size == 0 || chunk_size == 0 {
        return Vec::new();
    }

    let cs = chunk_size as u64;
    let total = ((file_size + cs - 1) / cs) as usize;
    let mut metas = Vec::with_capacity(total);

    let mut offset = 0u64;
    let mut seq = 0u32;
    while offset < file_size {
        let remaining = file_size - offset;
        let size = if remaining < cs {
            remaining as u32
        } else {
            chunk_size
        };
        metas.push(ChunkMeta { seq, offset, size });
        offset += size as u64;
        seq += 1;
    }

    metas
}

/// Нарезает данные на чанк по метаданным.
///
/// Возвращает slice данных для указанного чанка.
pub fn slice_chunk<'a>(data: &'a [u8], meta: &ChunkMeta) -> &'a [u8] {
    let start = meta.offset as usize;
    let end = std::cmp::min(start + meta.size as usize, data.len());
    if start >= data.len() {
        &[]
    } else {
        &data[start..end]
    }
}

// ─────────────────────────────────────────────────────────────
// Chunk reassembly
// ─────────────────────────────────────────────────────────────

/// Сборщик файла из чанков.
///
/// Принимает чанки в произвольном порядке, собирает результат.
pub struct ChunkAssembler {
    buffer: Vec<u8>,
    received: Vec<bool>,
    total_chunks: u32,
    chunks_received: u32,
}

impl ChunkAssembler {
    /// Создаёт сборщик для файла заданного размера.
    pub fn new(file_size: u64, chunk_size: u32) -> Self {
        let total = if file_size == 0 || chunk_size == 0 {
            0
        } else {
            ((file_size + chunk_size as u64 - 1) / chunk_size as u64) as u32
        };

        Self {
            buffer: vec![0u8; file_size as usize],
            received: vec![false; total as usize],
            total_chunks: total,
            chunks_received: 0,
        }
    }

    /// Добавляет чанк. Возвращает true если чанк был новым.
    pub fn insert(&mut self, seq: u32, offset: u64, data: &[u8]) -> bool {
        if seq >= self.total_chunks {
            return false;
        }
        if self.received[seq as usize] {
            return false; // дубликат
        }

        let start = offset as usize;
        let end = std::cmp::min(start + data.len(), self.buffer.len());
        if start < self.buffer.len() {
            self.buffer[start..end].copy_from_slice(&data[..end - start]);
        }

        self.received[seq as usize] = true;
        self.chunks_received += 1;
        true
    }

    /// Проверяет, все ли чанки получены.
    pub fn is_complete(&self) -> bool {
        self.chunks_received == self.total_chunks
    }

    /// Прогресс: доля полученных чанков (0.0 – 1.0).
    pub fn progress(&self) -> f64 {
        if self.total_chunks == 0 {
            return 1.0;
        }
        self.chunks_received as f64 / self.total_chunks as f64
    }

    /// Забирает собранный буфер. Валиден только после is_complete() == true.
    pub fn take_buffer(self) -> Vec<u8> {
        self.buffer
    }
}

// ─────────────────────────────────────────────────────────────
// Hash + Chunk (комбинированная операция)
// ─────────────────────────────────────────────────────────────

/// Хеширует данные и одновременно нарезает на чанки.
///
/// Возвращает (hash_hex, chunks).
/// Каждый chunk — (seq, offset, &[u8]).
pub fn hash_and_chunk(data: &[u8], chunk_size: u32) -> (String, Vec<ChunkMeta>) {
    let hash = sha256_buffer(data);
    let metas = compute_chunk_metas(data.len() as u64, chunk_size);
    (hash, metas)
}

// ─────────────────────────────────────────────────────────────
// Тесты
// ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_buffer() {
        let hash = sha256_buffer(b"hello");
        assert_eq!(
            hash,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn test_stream_hasher() {
        let mut hasher = StreamHasher::new();
        hasher.update(b"hel");
        hasher.update(b"lo");
        let hash = hasher.finalize();
        assert_eq!(hash, sha256_buffer(b"hello"));
    }

    #[test]
    fn test_stream_hasher_large() {
        // 10MB данных, хешим по 1MB
        let chunk = vec![0xABu8; 1024 * 1024];
        let mut hasher = StreamHasher::new();
        for _ in 0..10 {
            hasher.update(&chunk);
        }
        assert_eq!(hasher.bytes_hashed(), 10 * 1024 * 1024);
        let hash = hasher.finalize();

        // Проверяем с полным буфером
        let full = vec![0xABu8; 10 * 1024 * 1024];
        assert_eq!(hash, sha256_buffer(&full));
    }

    #[test]
    fn test_compute_chunk_metas() {
        let metas = compute_chunk_metas(100, 30);
        assert_eq!(metas.len(), 4);
        assert_eq!(metas[0].seq, 0);
        assert_eq!(metas[0].offset, 0);
        assert_eq!(metas[0].size, 30);
        assert_eq!(metas[3].seq, 3);
        assert_eq!(metas[3].offset, 90);
        assert_eq!(metas[3].size, 10); // последний чанк меньше
    }

    #[test]
    fn test_compute_chunk_metas_exact() {
        let metas = compute_chunk_metas(90, 30);
        assert_eq!(metas.len(), 3);
        for m in &metas {
            assert_eq!(m.size, 30);
        }
    }

    #[test]
    fn test_compute_chunk_metas_empty() {
        assert!(compute_chunk_metas(0, 30).is_empty());
        assert!(compute_chunk_metas(100, 0).is_empty());
    }

    #[test]
    fn test_slice_chunk() {
        let data = b"Hello, World!";
        let metas = compute_chunk_metas(data.len() as u64, 5);
        assert_eq!(slice_chunk(data, &metas[0]), b"Hello");
        assert_eq!(slice_chunk(data, &metas[1]), b", Wo");
        assert_eq!(slice_chunk(data, &metas[2]), b"rld!");
    }

    #[test]
    fn test_chunk_assembler() {
        let data = b"Hello, World! This is a test.";
        let chunk_size = 10u32;
        let metas = compute_chunk_metas(data.len() as u64, chunk_size);

        let mut assembler = ChunkAssembler::new(data.len() as u64, chunk_size);
        assert!(!assembler.is_complete());

        // Вставляем в обратном порядке
        for meta in metas.iter().rev() {
            let chunk = slice_chunk(data, meta);
            assert!(assembler.insert(meta.seq, meta.offset, chunk));
        }

        assert!(assembler.is_complete());
        assert!((assembler.progress() - 1.0).abs() < f64::EPSILON);
        assert_eq!(&assembler.take_buffer(), data);
    }

    #[test]
    fn test_chunk_assembler_duplicate() {
        let mut assembler = ChunkAssembler::new(10, 5);
        assert!(assembler.insert(0, 0, b"Hello"));
        assert!(!assembler.insert(0, 0, b"Hello")); // дубликат
    }

    #[test]
    fn test_hash_and_chunk() {
        let data = b"test data for hash and chunk";
        let (hash, metas) = hash_and_chunk(data, 10);
        assert_eq!(hash, sha256_buffer(data));
        assert_eq!(metas.len(), 3); // 28 bytes / 10 = 3 chunks
    }
}
