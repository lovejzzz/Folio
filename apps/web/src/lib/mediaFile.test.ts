import { describe, expect, it } from 'vitest';
import { checkMedia } from './mediaFile';

const MB = 1024 * 1024;

describe('what can go in a place on a page', () => {
  it('takes the pictures a browser can show, by type or, where there is none, by name', () => {
    expect(checkMedia('image', { name: 'a.png', type: 'image/png', size: 10 })).toEqual({ type: 'image/png' });
    expect(checkMedia('image', { name: 'photo.JPG', type: '', size: 10 })).toEqual({ type: 'image/jpeg' });
    expect(checkMedia('image', { name: 'drawing.svg', type: 'image/svg+xml', size: 10 })).toEqual({ problem: 'wrongType' });
    expect(checkMedia('image', { name: 'notes.pdf', type: 'application/pdf', size: 10 })).toEqual({ problem: 'wrongType' });
    expect(checkMedia('image', { name: 'a.png', type: 'image/png', size: 26 * MB })).toEqual({ problem: 'tooLarge' });
  });

  it('takes MP4, WebM and MOV video up to 200 MB', () => {
    expect(checkMedia('video', { name: 'roll.mov', type: 'video/quicktime', size: 199 * MB })).toEqual({ type: 'video/quicktime' });
    expect(checkMedia('video', { name: 'roll.m4v', type: 'video/x-m4v', size: 10 })).toEqual({ type: 'video/mp4' });
    expect(checkMedia('video', { name: 'roll.avi', type: 'video/x-msvideo', size: 10 })).toEqual({ problem: 'wrongType' });
    expect(checkMedia('video', { name: 'roll.mp4', type: 'video/mp4', size: 201 * MB })).toEqual({ problem: 'tooLarge' });
  });

  it('takes any file as an attachment, up to 200 MB', () => {
    expect(checkMedia('file', { name: 'HopStart.zip', type: 'application/zip', size: 10 })).toEqual({ type: 'application/zip' });
    expect(checkMedia('file', { name: 'huge.zip', type: 'application/zip', size: 201 * MB })).toEqual({ problem: 'tooLarge' });
  });
});
