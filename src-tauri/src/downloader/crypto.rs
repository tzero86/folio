use aes::cipher::{KeyIvInit, StreamCipher};
use base64::Engine;
use ctr::Ctr64BE;
use sha1::{Digest, Sha1};
use std::sync::LazyLock;

static PATH_REGEX: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"^https?://.*?/").expect("path regex is valid")
});

pub fn deobfuscate_image(
    image_data: &mut [u8],
    link: &str,
    obf_header: &str,
) -> anyhow::Result<()> {
    let (version, counter_b64) = obf_header
        .split_once('|')
        .ok_or_else(|| anyhow::anyhow!("invalid obfuscation header"))?;
    if version != "1" {
        anyhow::bail!("unsupported obfuscation version: {version}");
    }

    let counter_bytes = base64::engine::general_purpose::STANDARD.decode(counter_b64)?;
    if counter_bytes.len() != 16 {
        anyhow::bail!("counter must be 16 bytes");
    }

    let key_path = PATH_REGEX.replace(link, "/").to_string();
    let sha1_digest = Sha1::digest(key_path.as_bytes());
    let key = &sha1_digest[..16];

    let iv = &counter_bytes[..16];
    type AesCtr128 = Ctr64BE<aes::Aes128>;
    let mut cipher = AesCtr128::new(key.into(), iv.into());
    let end = image_data.len().min(1024);
    cipher.apply_keystream(&mut image_data[..end]);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use aes::cipher::{KeyIvInit, StreamCipher};
    use base64::Engine;

    fn encrypt_same_scheme(plain: &[u8], link: &str, counter: &[u8; 16]) -> Vec<u8> {
        let key_path = PATH_REGEX.replace(link, "/").to_string();
        let sha = Sha1::digest(key_path.as_bytes());
        type AesCtr128 = Ctr64BE<aes::Aes128>;
        let mut cipher = AesCtr128::new((&sha[..16]).into(), counter.into());
        let mut out = plain.to_vec();
        cipher.apply_keystream(&mut out[..plain.len().min(1024)]);
        out
    }

    #[test]
    fn deobfuscate_round_trips_first_1024_bytes() {
        let link = "https://archive.org/download/testbook/page1.jpg";
        let counter = [0x42u8; 16];
        let header = format!("1|{}", base64::engine::general_purpose::STANDARD.encode(counter));

        let mut plain = vec![0u8; 2048];
        for (i, b) in plain.iter_mut().enumerate() {
            *b = (i % 251) as u8;
        }
        let encrypted = encrypt_same_scheme(&plain, link, &counter);

        let mut data = encrypted.clone();
        deobfuscate_image(&mut data, link, &header).expect("deobfuscates");
        assert_eq!(&data[..1024], &plain[..1024], "first 1024 bytes restored");
        assert_eq!(&data[1024..], &encrypted[1024..], "tail untouched");
    }

    #[test]
    fn rejects_malformed_headers() {
        let mut data = vec![0u8; 32];
        let link = "https://archive.org/download/x/page.jpg";
        assert!(deobfuscate_image(&mut data, link, "garbage").is_err());
        assert!(deobfuscate_image(&mut data, link, "2|AAAA").is_err(), "unsupported version");
        let short = base64::engine::general_purpose::STANDARD.encode([0u8; 8]);
        assert!(deobfuscate_image(&mut data, link, &format!("1|{short}")).is_err(), "counter too short");
        assert!(deobfuscate_image(&mut data, link, "1|!!!notbase64!!!").is_err());
    }
}
