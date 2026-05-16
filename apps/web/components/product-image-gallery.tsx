'use client';

import { useEffect, useMemo, useState } from 'react';

type ProductImage = {
  src: string;
  alt: string;
};

type ProductImageGalleryProps = {
  productId: string;
  productName: string;
  images: ProductImage[];
};

export function ProductImageGallery({ productId, productName, images }: ProductImageGalleryProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [productId]);

  const activeImage = useMemo(() => images[activeImageIndex] ?? images[0], [activeImageIndex, images]);

  return (
    <section className="min-w-0">
      <div className="aspect-[4/5] overflow-hidden bg-muted">
        {activeImage ? (
          <img src={activeImage.src} alt={activeImage.alt} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
      </div>

      {images.length > 1 ? (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {images.map((image, index) => {
            const active = index === activeImageIndex;

            return (
              <button
                key={`${productId}-thumb-${index}`}
                type="button"
                onClick={() => setActiveImageIndex(index)}
                aria-label={`View ${productName} image ${index + 1}`}
                className={`overflow-hidden border ${
                  active ? 'border-foreground' : 'border-border'
                }`}
              >
                <img src={image.src} alt={image.alt} className="aspect-[4/5] w-full object-cover" />
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
