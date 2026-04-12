// virtual_scroll.rs — WASM-ускоренные вычисления для виртуального скроллинга.
//
// Вычисляет layout для списка сообщений:
//   - Какие элементы видимы при данном scrollTop и viewport height
//   - Высоту виртуального контейнера (total height)
//   - Offset сверху для первого видимого элемента
//
// Работает с массивом фиксированных/переменных высот строк.
// Используется из JS через WASM для ускорения layout-пересчётов
// при больших списках сообщений (1000+).

// ─────────────────────────────────────────────────────────────
// Layout engine
// ─────────────────────────────────────────────────────────────

/// Результат вычисления видимого диапазона.
#[derive(Debug, Clone)]
pub struct VisibleRange {
    /// Индекс первого видимого элемента.
    pub start: u32,
    /// Индекс последнего видимого элемента (включительно).
    pub end: u32,
    /// Offset (px) от начала контейнера до первого видимого элемента.
    pub offset_top: f64,
    /// Суммарная высота всех элементов.
    pub total_height: f64,
}

/// Вычисляет prefix sum высот для быстрого binary search.
///
/// heights[i] = высота i-го элемента.
/// Возвращает массив длины N+1: prefix[0]=0, prefix[i] = sum(heights[0..i]).
pub fn build_prefix_sums(heights: &[f64]) -> Vec<f64> {
    let mut prefix = Vec::with_capacity(heights.len() + 1);
    prefix.push(0.0);
    let mut acc = 0.0;
    for &h in heights {
        acc += h;
        prefix.push(acc);
    }
    prefix
}

/// Binary search по prefix sums: находит индекс элемента, в котором
/// попадает данная позиция scroll_pos.
///
/// Возвращает индекс первого элемента, чей нижний край >= scroll_pos.
fn find_index_at(prefix: &[f64], scroll_pos: f64) -> u32 {
    if prefix.len() <= 1 {
        return 0;
    }
    let n = prefix.len() - 1; // количество элементов

    // Binary search: находим наименьший i, такой что prefix[i+1] > scroll_pos
    let mut lo = 0usize;
    let mut hi = n;
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if prefix[mid + 1] <= scroll_pos {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    lo.min(n - 1) as u32
}

/// Вычисляет видимый диапазон элементов для заданного состояния scroll.
///
/// # Аргументы
/// - `heights` — массив высот всех элементов
/// - `scroll_top` — текущая позиция скролла (px от верха)
/// - `viewport_height` — высота видимой области (px)
/// - `overscan` — количество дополнительных элементов за пределами viewport
///                (буферная зона для плавности)
pub fn compute_visible_range(
    heights: &[f64],
    scroll_top: f64,
    viewport_height: f64,
    overscan: u32,
) -> VisibleRange {
    let n = heights.len();
    if n == 0 {
        return VisibleRange {
            start: 0,
            end: 0,
            offset_top: 0.0,
            total_height: 0.0,
        };
    }

    let prefix = build_prefix_sums(heights);
    let total_height = prefix[n];

    // Находим первый видимый элемент
    let raw_start = find_index_at(&prefix, scroll_top);
    let start = if raw_start > overscan {
        raw_start - overscan
    } else {
        0
    };

    // Находим последний видимый элемент
    let bottom = scroll_top + viewport_height;
    let raw_end = find_index_at(&prefix, bottom);
    let end = ((raw_end + overscan) as usize).min(n - 1) as u32;

    let offset_top = prefix[start as usize];

    VisibleRange {
        start,
        end,
        offset_top,
        total_height,
    }
}

/// Вычисляет видимый диапазон с фиксированной высотой строк.
///
/// Оптимизированная версия для uniform-height строк (не нужен prefix sum).
pub fn compute_visible_range_fixed(
    total_items: u32,
    row_height: f64,
    scroll_top: f64,
    viewport_height: f64,
    overscan: u32,
) -> VisibleRange {
    if total_items == 0 || row_height <= 0.0 {
        return VisibleRange {
            start: 0,
            end: 0,
            offset_top: 0.0,
            total_height: 0.0,
        };
    }

    let total_height = total_items as f64 * row_height;

    let raw_start = (scroll_top / row_height).floor() as u32;
    let start = if raw_start > overscan {
        raw_start - overscan
    } else {
        0
    };

    let raw_end = ((scroll_top + viewport_height) / row_height).ceil() as u32;
    let end = (raw_end + overscan).min(total_items - 1);

    let offset_top = start as f64 * row_height;

    VisibleRange {
        start,
        end,
        offset_top,
        total_height,
    }
}

/// Находит индекс элемента по Y-позиции (для scroll-to-item).
pub fn find_item_at_position(heights: &[f64], y_position: f64) -> u32 {
    let prefix = build_prefix_sums(heights);
    find_index_at(&prefix, y_position)
}

/// Вычисляет Y-позицию для скролла к элементу по индексу.
pub fn get_item_offset(heights: &[f64], index: u32) -> f64 {
    let idx = (index as usize).min(heights.len());
    heights[..idx].iter().sum()
}

// ─────────────────────────────────────────────────────────────
// Тесты
// ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_prefix_sums() {
        let heights = vec![10.0, 20.0, 30.0, 40.0];
        let prefix = build_prefix_sums(&heights);
        assert_eq!(prefix, vec![0.0, 10.0, 30.0, 60.0, 100.0]);
    }

    #[test]
    fn test_find_index_at() {
        let prefix = vec![0.0, 10.0, 30.0, 60.0, 100.0];
        assert_eq!(find_index_at(&prefix, 0.0), 0);
        assert_eq!(find_index_at(&prefix, 5.0), 0);
        assert_eq!(find_index_at(&prefix, 10.0), 1);
        assert_eq!(find_index_at(&prefix, 29.0), 1);
        assert_eq!(find_index_at(&prefix, 30.0), 2);
        assert_eq!(find_index_at(&prefix, 99.0), 3);
    }

    #[test]
    fn test_compute_visible_range_basic() {
        // 10 элементов по 50px = 500px total, viewport 200px
        let heights = vec![50.0; 10];
        let range = compute_visible_range(&heights, 0.0, 200.0, 0);
        assert_eq!(range.start, 0);
        assert_eq!(range.end, 3); // items 0-3 are in 0-200px
        assert_eq!(range.total_height, 500.0);
        assert_eq!(range.offset_top, 0.0);
    }

    #[test]
    fn test_compute_visible_range_scrolled() {
        let heights = vec![50.0; 10];
        let range = compute_visible_range(&heights, 100.0, 200.0, 0);
        assert_eq!(range.start, 2); // 100px / 50px = item 2
        assert_eq!(range.end, 5); // (100+200)px / 50px = item 5
    }

    #[test]
    fn test_compute_visible_range_overscan() {
        let heights = vec![50.0; 10];
        let range = compute_visible_range(&heights, 200.0, 200.0, 2);
        // raw_start = 4, with overscan 2 → start = 2
        assert_eq!(range.start, 2);
        // raw_end = 7, with overscan 2 → end = 9 (clamped to N-1)
        assert_eq!(range.end, 9);
    }

    #[test]
    fn test_compute_visible_range_variable_heights() {
        // Разные высоты: [20, 80, 30, 70, 50]
        // prefix: [0, 20, 100, 130, 200, 250]
        let heights = vec![20.0, 80.0, 30.0, 70.0, 50.0];
        let range = compute_visible_range(&heights, 50.0, 100.0, 0);
        // scroll_top=50 → внутри элемента 1 (20-100)
        assert_eq!(range.start, 1);
        // bottom=150 → внутри элемента 3 (130-200)
        assert_eq!(range.end, 3);
    }

    #[test]
    fn test_compute_visible_range_fixed() {
        let range = compute_visible_range_fixed(100, 50.0, 0.0, 500.0, 2);
        assert_eq!(range.start, 0);
        assert_eq!(range.end, 12); // ceil(500/50) + 2 = 12
        assert_eq!(range.total_height, 5000.0);
    }

    #[test]
    fn test_compute_visible_range_fixed_scrolled() {
        let range = compute_visible_range_fixed(100, 50.0, 1000.0, 500.0, 0);
        assert_eq!(range.start, 20); // 1000/50 = 20
        assert_eq!(range.end, 30); // (1000+500)/50 = 30
        assert_eq!(range.offset_top, 1000.0);
    }

    #[test]
    fn test_find_item_at_position() {
        let heights = vec![20.0, 80.0, 30.0, 70.0, 50.0];
        assert_eq!(find_item_at_position(&heights, 0.0), 0);
        assert_eq!(find_item_at_position(&heights, 50.0), 1);
        assert_eq!(find_item_at_position(&heights, 100.0), 2);
    }

    #[test]
    fn test_get_item_offset() {
        let heights = vec![20.0, 80.0, 30.0, 70.0, 50.0];
        assert_eq!(get_item_offset(&heights, 0), 0.0);
        assert_eq!(get_item_offset(&heights, 1), 20.0);
        assert_eq!(get_item_offset(&heights, 3), 130.0);
        assert_eq!(get_item_offset(&heights, 5), 250.0);
    }

    #[test]
    fn test_empty_input() {
        let range = compute_visible_range(&[], 0.0, 500.0, 0);
        assert_eq!(range.start, 0);
        assert_eq!(range.end, 0);
        assert_eq!(range.total_height, 0.0);

        let range2 = compute_visible_range_fixed(0, 50.0, 0.0, 500.0, 0);
        assert_eq!(range2.total_height, 0.0);
    }

    #[test]
    fn test_large_list_performance() {
        // 100k элементов — binary search должен быть мгновенным
        let heights: Vec<f64> = (0..100_000).map(|i| 40.0 + (i % 50) as f64).collect();
        let range = compute_visible_range(&heights, 500_000.0, 1000.0, 5);
        assert!(range.start > 0);
        assert!(range.end > range.start);
        assert!(range.total_height > 0.0);
    }
}
