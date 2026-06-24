'use client';

export function useToast() {
  const toast = ({ title, description, variant }: { title: string; description?: string; variant?: string }) => {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('app-toast', { detail: { title, description, variant } });
      window.dispatchEvent(event);
    }
  };
  return { toast };
}
