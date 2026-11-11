//! Value formatting shared by the routes: CSV cells, token units, dates and page cursors.

use base64::Engine;
use base64::engine::DecodePaddingMode;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};

const NANOS_PER_DAY: u128 = 86_400 * 1_000_000_000;

/// Days since 1970-01-01 to a civil (year, month, day), proleptic Gregorian.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = u32::try_from(doy - (153 * mp + 2) / 5 + 1).unwrap_or(1);
    let month = u32::try_from(if mp < 10 { mp + 3 } else { mp - 9 }).unwrap_or(1);
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// `YYYY-MM-DD` of a day index since the Unix epoch.
pub fn date_of_day(day: i64) -> String {
    let (y, m, d) = civil_from_days(day);
    format!("{y:04}-{m:02}-{d:02}")
}

/// A nanosecond timestamp as ISO 8601 UTC with milliseconds, like `Date.toISOString`.
pub fn iso_from_nanos(nanos: &str) -> String {
    let value: u128 = nanos.parse().unwrap_or_default();
    let day = i64::try_from(value / NANOS_PER_DAY).unwrap_or_default();
    let rest = value % NANOS_PER_DAY;
    let millis = rest / 1_000_000;
    let (h, m, s, ms) = (
        millis / 3_600_000,
        millis / 60_000 % 60,
        millis / 1_000 % 60,
        millis % 1_000,
    );
    format!("{}T{h:02}:{m:02}:{s:02}.{ms:03}Z", date_of_day(day))
}

/// An amount in the token's smallest unit as a decimal string.
pub fn format_units(amount: &str, decimals: u32) -> String {
    let decimals = decimals as usize;
    if decimals == 0 {
        return amount.to_owned();
    }
    let padded = format!("{amount:0>width$}", width = decimals + 1);
    let (whole, fraction) = padded.split_at(padded.len() - decimals);
    let fraction = fraction.trim_end_matches('0');
    if fraction.is_empty() {
        whole.to_owned()
    } else {
        format!("{whole}.{fraction}")
    }
}

/// `amount` (smallest token unit, `decimals` places) times `rate` (a positive decimal), rounded
/// half up to two decimals. Exact integer arithmetic; `None` when the rate is malformed or the
/// product overflows.
pub fn fiat_value(amount: &str, decimals: u32, rate: &str) -> Option<String> {
    let (whole, fraction) = rate.split_once('.').unwrap_or((rate, ""));
    let valid = |part: &str| part.bytes().all(|b| b.is_ascii_digit());
    if whole.is_empty() || !valid(whole) || !valid(fraction) || fraction.len() > 18 {
        return None;
    }
    let mantissa: u128 = format!("{whole}{fraction}").parse().ok()?;
    let raw: u128 = amount.parse().ok()?;
    let product = raw.checked_mul(mantissa)?;
    let scale = decimals.checked_add(u32::try_from(fraction.len()).ok()?)?;
    let cents = if scale >= 2 {
        let divisor = 10u128.checked_pow(scale - 2)?;
        product.checked_add(divisor / 2)? / divisor
    } else {
        product.checked_mul(10u128.pow(2 - scale))?
    };
    Some(format!("{}.{:02}", cents / 100, cents % 100))
}

fn escape_cell(value: &str) -> String {
    // Prefix formula triggers so spreadsheets show the value instead of evaluating it.
    let safe = if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.to_owned()
    };
    if safe.contains(['"', ',', '\n', '\r']) {
        format!("\"{}\"", safe.replace('"', "\"\""))
    } else {
        safe
    }
}

/// RFC 4180 CSV with a header row and CRLF line endings.
pub fn to_csv(header: &[&str], rows: &[Vec<Option<String>>]) -> String {
    let mut out = String::new();
    let header: Vec<String> = header.iter().map(|h| escape_cell(h)).collect();
    out.push_str(&header.join(","));
    out.push_str("\r\n");
    for row in rows {
        let cells: Vec<String> = row
            .iter()
            .map(|cell| escape_cell(cell.as_deref().unwrap_or_default()))
            .collect();
        out.push_str(&cells.join(","));
        out.push_str("\r\n");
    }
    out
}

const CURSOR: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::URL_SAFE,
    GeneralPurposeConfig::new()
        .with_encode_padding(false)
        .with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

/// Opaque cursor over a numeric row id, so clients never depend on the encoding.
pub fn encode_cursor(id: i64) -> String {
    CURSOR.encode(format!("p:{id}"))
}

/// The row id inside `cursor`, or `None` when it is not a cursor this API issued.
pub fn decode_cursor(cursor: &str) -> Option<i64> {
    let bytes = CURSOR.decode(cursor).ok()?;
    let text = std::str::from_utf8(&bytes).ok()?;
    let digits = text.strip_prefix("p:")?;
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

/// Nanoseconds since the Unix epoch, from the system clock.
pub fn now_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default()
}

/// Start of the UTC day containing `nanos`.
pub fn day_start(nanos: u128) -> u128 {
    nanos / NANOS_PER_DAY * NANOS_PER_DAY
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_dates_like_javascript() {
        assert_eq!(
            iso_from_nanos("1794000103000000000"),
            "2026-11-06T21:21:43.000Z"
        );
        assert_eq!(iso_from_nanos("0"), "1970-01-01T00:00:00.000Z");
        assert_eq!(date_of_day(19_723), "2024-01-01");
        assert_eq!(date_of_day(11_016), "2000-02-29");
    }

    #[test]
    fn formats_token_units() {
        assert_eq!(format_units("40000000", 6), "40");
        assert_eq!(format_units("1500000", 6), "1.5");
        assert_eq!(format_units("5", 6), "0.000005");
        assert_eq!(format_units("12", 0), "12");
    }

    #[test]
    fn issue_72_values_amounts_in_fiat_exactly() {
        assert_eq!(
            fiat_value("40000000", 6, "16250").as_deref(),
            Some("650000.00")
        );
        assert_eq!(fiat_value("1500000", 6, "0.92").as_deref(), Some("1.38"));
        assert_eq!(fiat_value("5", 6, "1.005").as_deref(), Some("0.00"));
        assert_eq!(fiat_value("12345", 2, "1").as_deref(), Some("123.45"));
        assert_eq!(
            fiat_value("1", 0, "0.005").as_deref(),
            Some("0.01"),
            "rounds half up"
        );
        for bad in ["", "-1", "1.2.3", "1e3", ".5"] {
            assert_eq!(fiat_value("1", 6, bad), None, "{bad}");
        }
        assert_eq!(fiat_value(&u128::MAX.to_string(), 6, "2"), None, "overflow");
    }

    #[test]
    fn escapes_csv_cells() {
        let csv = to_csv(
            &["a", "b"],
            &[
                vec![Some("=SUM(A1)".into()), Some("x,\"y\"".into())],
                vec![None, Some("-5".into())],
            ],
        );
        assert_eq!(csv, "a,b\r\n'=SUM(A1),\"x,\"\"y\"\"\"\r\n,'-5\r\n");
    }

    #[test]
    fn round_trips_cursors_and_rejects_others() {
        assert_eq!(decode_cursor(&encode_cursor(42)), Some(42));
        assert_eq!(encode_cursor(4), "cDo0");
        assert_eq!(decode_cursor("bogus"), None);
        assert_eq!(decode_cursor(&CURSOR.encode("p:")), None);
        assert_eq!(decode_cursor(&CURSOR.encode("x:1")), None);
    }
}
