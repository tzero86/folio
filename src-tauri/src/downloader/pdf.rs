use std::fs::{self, File};
use std::io::BufWriter;
use std::path::Path;

use anyhow::{Context, Result};
use image_crate::GenericImageView;
use printpdf::*;

fn jpeg_dimensions_and_components(data: &[u8]) -> Option<((u32, u32), u8)> {
    let mut i = 0;
    while i + 1 < data.len() {
        if data[i] != 0xFF {
            i += 1;
            continue;
        }
        if i + 2 > data.len() {
            return None;
        }
        let marker = data[i + 1];
        // 0xFF00 is an escaped 0xFF byte inside entropy data; 0xFFFF is padding.
        if marker == 0x00 || marker == 0xFF {
            i += 2;
            continue;
        }
        // Standalone markers: SOI, EOI, RSTm, TEM
        if marker == 0xD8 || marker == 0xD9 || (0xD0..=0xD7).contains(&marker) || marker == 0x01 {
            i += 2;
            continue;
        }
        // APPn and COM segments have a length word
        if (0xE0..=0xEF).contains(&marker) || marker == 0xFE {
            if i + 3 >= data.len() {
                return None;
            }
            let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
            i += 2 + len;
            continue;
        }
        // SOFn markers carry the image dimensions and component count
        if (0xC0..=0xCF).contains(&marker) && marker != 0xC4 && marker != 0xC8 && marker != 0xCC {
            if i + 9 >= data.len() {
                return None;
            }
            let height = u16::from_be_bytes([data[i + 5], data[i + 6]]) as u32;
            let width = u16::from_be_bytes([data[i + 7], data[i + 8]]) as u32;
            let components = data[i + 9];
            return Some(((width, height), components));
        }
        // All other markers (DHT, DQT, etc.) have a length word
        if i + 3 >= data.len() {
            return None;
        }
        let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
        i += 2 + len;
    }
    None
}

fn image_xobject_from_path(path: &Path) -> Result<ImageXObject> {
    let bytes = fs::read(path)
        .with_context(|| format!("reading image {}", path.display()))?;

    let ((width, height), components) = match jpeg_dimensions_and_components(&bytes) {
        Some(v) => v,
        None => {
            let img = image_crate::open(path)
                .with_context(|| format!("fallback open for {}", path.display()))?;
            let (w, h) = img.dimensions();
            let components = match img.color() {
                image_crate::ColorType::L8 | image_crate::ColorType::L16 => 1,
                _ => 3,
            };
            ((w, h), components)
        }
    };

    let color_space = if components == 1 {
        ColorSpace::Greyscale
    } else if components == 4 {
        ColorSpace::Cmyk
    } else {
        ColorSpace::Rgb
    };

    Ok(ImageXObject {
        width: Px(width as usize),
        height: Px(height as usize),
        color_space,
        bits_per_component: ColorBits::Bit8,
        image_data: bytes,
        image_filter: Some(ImageFilter::DCT),
        interpolate: false,
        smask: None,
        clipping_bbox: None,
    })
}

pub fn images_to_pdf(image_paths: &[std::path::PathBuf], output: &Path, title: &str) -> Result<()> {
    if image_paths.is_empty() {
        anyhow::bail!("no images to assemble");
    }

    let first_xobj = image_xobject_from_path(&image_paths[0])?;
    let first_w = first_xobj.width.0 as f32;
    let first_h = first_xobj.height.0 as f32;

    let (doc, page1, layer1) = PdfDocument::new(
        title.to_string(),
        Mm(first_w * 0.0847),
        Mm(first_h * 0.0847),
        "Layer 1".to_string(),
    );

    for (i, path) in image_paths.iter().enumerate() {
        let xobj = image_xobject_from_path(path)?;
        let w = xobj.width.0 as f32;
        let h = xobj.height.0 as f32;
        let width = Mm(w * 0.0847);
        let height = Mm(h * 0.0847);

        let (page, _layer_index) = if i == 0 {
            (page1, layer1)
        } else {
            doc.add_page(width, height, format!("Layer {}", i + 1))
        };
        let layer = doc.get_page(page).add_layer(format!("Image {}", i + 1));

        let image = Image::from(xobj);
        image.add_to_layer(layer, ImageTransform::default());
    }

    let file = File::create(output)
        .with_context(|| format!("creating PDF file {}", output.display()))?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer)
        .with_context(|| format!("saving PDF to {}", output.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::jpeg_dimensions_and_components;

    #[test]
    fn parses_sof_dimensions_and_components() {
        let mut b = vec![0xFF, 0xD8]; // SOI
        // APP0 (len 16)
        b.extend_from_slice(&[
            0xFF, 0xE0, 0x00, 0x10, b'J', b'F', b'I', b'F', 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
            0x00, 0x00,
        ]);
        // SOF0 (len 17): precision 8, height 4, width 3, 3 components
        b.extend_from_slice(&[
            0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x04, 0x00, 0x03, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
            0x03, 0x11, 0x00,
        ]);
        let ((w, h), comps) = jpeg_dimensions_and_components(&b).expect("parses");
        assert_eq!((w, h), (3, 4));
        assert_eq!(comps, 3);
    }

    #[test]
    fn detects_grayscale_components() {
        let b = [
            0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01,
        ];
        let ((w, h), comps) = jpeg_dimensions_and_components(&b).expect("parses");
        assert_eq!((w, h), (32, 16));
        assert_eq!(comps, 1);
    }

    #[test]
    fn handles_escaped_ff_bytes_in_entropy_data() {
        // SOF followed by entropy data containing 0xFF00 (escaped byte)
        let mut b = vec![0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01];
        b.extend_from_slice(&[0xDA, 0xFF, 0x00, 0xFF, 0xFF, 0x12]); // SOS + escaped bytes
        let ((w, h), _) = jpeg_dimensions_and_components(&b).expect("parses");
        assert_eq!((w, h), (32, 16));
    }

    #[test]
    fn returns_none_for_truncated_data() {
        assert!(jpeg_dimensions_and_components(&[]).is_none());
        assert!(jpeg_dimensions_and_components(&[0xFF, 0xD8]).is_none());
        assert!(jpeg_dimensions_and_components(&[0xFF, 0xC0]).is_none());
    }
}
