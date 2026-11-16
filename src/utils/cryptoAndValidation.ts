import { NoticeStatus, PublicNotice } from '../types';

export const UG_PHONE_REGEX = /^\+256\d{9}$/;

export function normalizeUgPhone(input: string): string {
  const cleaned = input.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `+256${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith('256') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  return cleaned;
}

export function isValidUgPhone(input: string): boolean {
  return UG_PHONE_REGEX.test(input.trim());
}

export function formatUgPhoneDisplay(phone: string): string {
  if (!isValidUgPhone(phone)) return phone;
  return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7, 10)} ${phone.slice(10)}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateManagementToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateClaimCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < bytes.length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return `CLM-${code}`;
}

export function generateDocId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${hex}`;
}

export function extractTokenFromInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('token=')) {
      const url = trimmed.startsWith('http')
        ? new URL(trimmed)
        : new URL(trimmed, 'https://campustrace.local');
      const tokenParam = url.searchParams.get('token');
      if (tokenParam) return tokenParam.trim();
    }
  } catch {
    // Fallback to raw string parsing below
  }
  const match = trimmed.match(/token=([a-fA-F0-9]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}

export function isOlderThanDays(date: Date | string | null | undefined, days: number): boolean {
  if (!date) return false;
  const target = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(target.getTime())) return false;
  const diffMs = Date.now() - target.getTime();
  return diffMs > days * 24 * 60 * 60 * 1000;
}

export function getEffectiveNoticeStatus(notice: PublicNotice): NoticeStatus {
  if (notice.status === 'open' && isOlderThanDays(notice.createdAt, 60)) {
    return 'archived';
  }
  return notice.status;
}

export function formatShortDate(dateInput: Date | string): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString('en-UG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 960,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
