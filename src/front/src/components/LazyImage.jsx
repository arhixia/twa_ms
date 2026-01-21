import React, { useState, useRef, useEffect } from 'react';

const LazyImage = ({ src, alt, thumbSrc, ...props }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect(); // Отключаем наблюдение после первого срабатывания
        }
      },
      { rootMargin: '50px' } // Начинаем загрузку, когда изображение за 50px до области видимости
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current);
      }
    };
  }, []);

  const handleLoad = () => setIsLoaded(true);

  return (
    <div ref={imgRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Плейсхолдер/превьюшка до загрузки основного изображения */}
      {!isLoaded && thumbSrc && (
        <img
          src={thumbSrc}
          alt=""
          style={{ maxHeight: props.style?.maxHeight || 100, maxWidth: '100%', objectFit: 'contain', opacity: 0.7 }}
          aria-hidden="true" // Скрываем из дерева доступности
        />
      )}
      {/* Основное изображение, которое загружается при попадании в область видимости */}
      {(isInView || isLoaded) && ( // Показываем основное изображение, если оно в области видимости или уже загружено
        <img
          {...props}
          src={src}
          alt={alt}
          onLoad={handleLoad}
          style={{
            maxHeight: props.style?.maxHeight || 100,
            maxWidth: '100%',
            objectFit: 'contain',
            display: isLoaded ? 'block' : 'none', // Скрываем до загрузки
          }}
        />
      )}
    </div>
  );
};

export default LazyImage;