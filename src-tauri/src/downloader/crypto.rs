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
