//! Reference subtitle alignment with piecewise offsets (different cuts of the same film).
use alass_core::{align, standard_scoring, NoProgressHandler, TimeSpan};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct Span { pub start: f64, pub end: f64 }
#[derive(Serialize)]
pub struct Alignment { pub offsets: Vec<f64>, pub score: f64, pub splits: usize }

pub fn align_reference(reference: Vec<Span>, subtitle: Vec<Span>, penalty: f64) -> Result<Alignment, String> {
    fn prepare(rows: &[Span]) -> Result<Vec<TimeSpan>, String> {
        if rows.is_empty() || rows.len() > 5000 { return Err("Reference alignment requires 1–5000 subtitle lines".into()); }
        let mut previous = -1.0;
        rows.iter().map(|s| {
            if !s.start.is_finite() || !s.end.is_finite() || s.start < 0.0 || s.end <= s.start || s.end > 172800.0 || s.start < previous {
                return Err("Invalid or unsorted subtitle timestamps".into());
            }
            previous = s.start;
            let start = (s.start * 100.0).round() as i64;
            let end = ((s.end * 100.0).round() as i64).max(start + 1);
            Ok(TimeSpan::new(start.into(), end.into()))
        }).collect()
    }
    if !penalty.is_finite() || !(1.0..=30.0).contains(&penalty) { return Err("Invalid split penalty".into()); }
    let reference = prepare(&reference)?;
    let subtitle = prepare(&subtitle)?;
    let (offsets, score) = align(&reference, &subtitle, penalty, Some(3.0), standard_scoring, NoProgressHandler);
    let offsets: Vec<f64> = offsets.into_iter().map(|d| d.as_f64() / 100.0).collect();
    let splits = offsets.windows(2).filter(|w| (w[0] - w[1]).abs() > 0.02).count();
    Ok(Alignment { offsets, score, splits })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_inputs_are_errors() {
        assert!(align_reference(vec![], vec![], 7.0).is_err());
        assert!(align_reference(vec![Span { start: f64::NAN, end: 1.0 }], vec![Span { start: 0.0, end: 1.0 }], 7.0).is_err());
    }
    #[test]
    fn reference_shift_is_returned_per_line() {
        let spans = |shift| (0..30).map(|i| Span { start: i as f64 * 7.0 + shift, end: i as f64 * 7.0 + shift + 1.0 + (i % 4) as f64 * 0.2 }).collect();
        let result = align_reference(spans(5.25), spans(0.0), 7.0).unwrap();
        assert_eq!(result.offsets.len(), 30);
        assert!(result.offsets.iter().all(|d| (d - 5.25).abs() < 0.02));
    }
}
