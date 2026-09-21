const { nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let imageSize;
try {
  imageSize = require('image-size');
} catch (e) {
  console.warn('image-size package not loaded');
}

const MAX_THUMBNAIL_SIZE = 2048; // Cap for memory safety

class ThumbnailService {
  constructor() {
    this.cache = new Map();
    this.maxCacheEntries = 500;
  }

  isImageFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.tiff', '.tif', '.svg'].includes(ext);
  }

  /**
   * Returns image resized to the REQUESTED size.
   * The `size` parameter specifies the longest dimension of the output.
   * Images smaller than the requested size are NOT upscaled.
   * Images larger than MAX_THUMBNAIL_SIZE are capped for memory safety.
   *
   * Cache key includes both path AND size to avoid stale entries.
   */
  async getThumbnail(filePath, size = 160) {
    if (!this.isImageFile(filePath)) return null;

    // Cache key includes the requested size — different sizes get different entries
    const cacheKey = `${filePath}@${size}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const img = nativeImage.createFromPath(filePath);
      if (img.isEmpty()) return null;

      const { width, height } = img.getSize();
      const maxDim = Math.max(width, height);

      // Determine the target size:
      // - If original is smaller than requested → return original (don't upscale)
      // - If original is larger than requested → resize to requested size
      // - Cap at MAX_THUMBNAIL_SIZE for memory safety
      const targetSize = Math.min(MAX_THUMBNAIL_SIZE, size);

      let finalImg;
      if (maxDim > targetSize) {
        // Downscale to the requested resolution
        const scale = targetSize / maxDim;
        const newW = Math.max(1, Math.round(width * scale));
        const newH = Math.max(1, Math.round(height * scale));
        finalImg = img.resize({ width: newW, height: newH });
      } else {
        // Original is already small enough — return as-is
        finalImg = img;
      }

      const finalSize = finalImg.getSize();
      const dataUrl = finalImg.toDataURL('image/png');

      // Evict oldest if cache is full
      if (this.cache.size >= this.maxCacheEntries) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, dataUrl);
      return dataUrl;
    } catch (err) {
      console.error(`ThumbnailService: error for ${filePath}`, err.message);
      return null;
    }
  }

  /**
   * Returns a high-resolution version of the image for inspector preview.
   * Uses the original image at up to 1024px on the longest side.
   */
  async getInspectorPreview(filePath) {
    if (!this.isImageFile(filePath)) return null;

    const cacheKey = `${filePath}@inspector`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    try {
      const img = nativeImage.createFromPath(filePath);
      if (img.isEmpty()) return null;

      const { width, height } = img.getSize();
      const maxSide = Math.max(width, height);
      if (maxSide > 1024) {
        const scale = 1024 / maxSide;
        const newW = Math.max(1, Math.round(width * scale));
        const newH = Math.max(1, Math.round(height * scale));
        const resized = img.resize({ width: newW, height: newH });
        const dataUrl = resized.toDataURL('image/png');
        this.cache.set(cacheKey, dataUrl);
        return dataUrl;
      }
      const dataUrl = img.toDataURL('image/png');
      this.cache.set(cacheKey, dataUrl);
      return dataUrl;
    } catch (err) {
      return null;
    }
  }

  getImageDimensions(filePath) {
    if (!this.isImageFile(filePath) || !imageSize) return null;
    try {
      const dims = imageSize(filePath);
      if (dims && dims.width && dims.height) {
        let label = `${dims.width} × ${dims.height}`;
        if (dims.width >= 3840 && dims.height >= 2160) label += ' (4K UHD)';
        else if (dims.width >= 2560 && dims.height >= 1440) label += ' (2K QHD)';
        else if (dims.width >= 1920 && dims.height >= 1080) label += ' (1080p FHD)';
        else if (dims.width === dims.height) label += ' (1:1)';
        return { width: dims.width, height: dims.height, type: dims.type, formatted: label };
      }
    } catch (err) {}
    return null;
  }
}

module.exports = new ThumbnailService();
