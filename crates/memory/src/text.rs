//! Tokenizer for BM25: lowercase, split on anything that is not a letter or
//! digit, drop stop words and one character tokens, strip a few English
//! suffixes (ing, ed, es, s).

const STOP: &[&str] = &[
    "a", "about", "after", "again", "all", "am", "an", "and", "any", "are", "as", "at", "be",
    "been", "before", "being", "but", "by", "can", "could", "did", "do", "does", "doing", "for",
    "from", "had", "has", "have", "having", "he", "her", "here", "hers", "him", "his", "how", "i",
    "if", "in", "into", "is", "it", "its", "just", "me", "more", "my", "no", "nor", "not", "of",
    "off", "on", "once", "only", "or", "other", "our", "out", "over", "own", "same", "she", "so",
    "some", "such", "than", "that", "the", "their", "them", "then", "there", "these", "they",
    "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were",
    "what", "when", "where", "which", "while", "who", "whom", "why", "will", "with", "would",
    "you", "your", "yours",
];

fn stem(w: &str) -> &str {
    let n = w.len();
    if n > 5 && w.ends_with("ing") {
        &w[..n - 3]
    } else if n > 4 && (w.ends_with("ed") || w.ends_with("es")) {
        &w[..n - 2]
    } else if n > 3 && w.ends_with('s') && !w.ends_with("ss") {
        &w[..n - 1]
    } else {
        w
    }
}

/// Tokens of a text in order, stemmed, stop words removed.
pub fn tokenize(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let flush = |cur: &mut String, out: &mut Vec<String>| {
        if cur.chars().count() > 1 && !STOP.contains(&cur.as_str()) {
            out.push(stem(cur).to_string());
        }
        cur.clear();
    };
    for c in text.chars() {
        if c.is_alphanumeric() {
            cur.extend(c.to_lowercase());
        } else {
            flush(&mut cur, &mut out);
        }
    }
    flush(&mut cur, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_stems_and_drops_stop_words() {
        assert_eq!(
            tokenize("The cats were Walking to the boxes, I picked mugs."),
            vec!["cat", "walk", "box", "pick", "mug"]
        );
        assert_eq!(tokenize("glass pass"), vec!["glass", "pass"]);
        assert!(tokenize("a I , .").is_empty());
    }
}
