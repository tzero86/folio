use std::fs::{self, File};
use std::io::BufWriter;
use std::path::Path;

use anyhow::{Context, Result};
use image_crate::GenericImageView;
use printpdf::*;

fn image_xobject_from_path(path: &Path) -> Result<ImageXObject> {
    let bytes = fs::read(path)
        .with_context(|| format!("reading image {}", path.display()))?;

    let img = image_crate::open(path)
        .with_context(|| format!("opening image {}", path.display()))?;
    let (width, height) = img.dimensions();
    let color_type = img.color();

    let (color_space, bits) = match color_type {
        image_crate::ColorType::L8 | image_crate::ColorType::L16 => (ColorSpace::Greyscale, ColorBits::Bit8),
        image_crate::ColorType::Rgb8
        | image_crate::ColorType::Rgb16
        | image_crate::ColorType::Rgba8
        | image_crate::ColorType::Rgba16 => (ColorSpace::Rgb, ColorBits::Bit8),
        _ => (ColorSpace::Rgb, ColorBits::Bit8),
    };

    let is_jpeg = image_crate::io::Reader::open(path)?
        .with_guessed_format()?
        .format()
        == Some(image_crate::ImageFormat::Jpeg);

    Ok(ImageXObject {
        width: Px(width as usize),
        height: Px(height as usize),
        color_space,
        bits_per_component: bits,
        image_data: bytes,
        image_filter: if is_jpeg { Some(ImageFilter::DCT) } else { None },
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
