import { describe, expect, it } from 'vitest';
import { looksSpanish, spokenIn } from '../src';

describe('telling Spanish from English', () => {
  it('knows a Spanish translation, with or without accents', () => {
    expect(looksSpanish('Los estudiantes comparan las dos muestras y explican cuál fue elegida al azar.')).toBe(true);
    expect(looksSpanish('¿Qué pregunta necesita datos de muchas personas?')).toBe(true);
    expect(looksSpanish('La media y la mediana son medidas de centro')).toBe(true);
  });

  it('leaves English alone, even with Spanish names or a stray "en" in it', () => {
    expect(looksSpanish('Students compare the two samples and explain which one was random.')).toBe(false);
    expect(looksSpanish('A trip to San José and Los Angeles for the class.')).toBe(false);
    expect(looksSpanish('Mean and median')).toBe(false);
    expect(looksSpanish('El Niño')).toBe(false);
  });

  it('doesn’t take an accent, a name or the variable y for Spanish', () => {
    for (const english of ['Graph y against x, then y against z', 'Find y when y = 2x', 'Résumé writing workshop', 'Café culture essay', 'Gabriel García Márquez', 'Pokémon card statistics', 'Simón Bolívar revolution leader', 'Beyoncé and pop feminism', 'Los Angeles water history']) {
      expect(looksSpanish(english), english).toBe(false);
    }
    expect(looksSpanish('Como agua para chocolate')).toBe(true);
    expect(looksSpanish('Grafica y contra x, y explica la pendiente de la recta')).toBe(true);
  });

  it('marks a field Spanish only in an English course', () => {
    expect(spokenIn('Los estudiantes comparan las dos muestras.', 'en')).toBe('es');
    expect(spokenIn('Students compare the two samples.', 'en')).toBe('en');
    expect(spokenIn('Los estudiantes comparan las dos muestras.', 'zh-CN')).toBe('zh-CN');
  });
});
