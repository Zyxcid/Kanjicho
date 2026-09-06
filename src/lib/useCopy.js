import { useCallback, useEffect, useRef, useState } from "react";

// useCopy — salin teks pendek (satu karakter kanji) ke clipboard, plus state
// `copied` untuk feedback UI sesaat (~1.4s) setelah sukses.
//
// Dua jalur penulisan:
//  1. navigator.clipboard.writeText — API modern; hanya ada di secure
//     context (HTTPS / localhost / PWA ter-install). Jalur utama app ini.
//  2. Fallback textarea + document.execCommand("copy") untuk konteks
//     non-secure (mis. dibuka via http di LAN). Best-effort — jika
//     browser juga memblokir ini, salin dianggap gagal dan UI cukup
//     diam (tidak ada error yang dilempar ke user).
//
// State `copied` di-reset otomatis oleh timer; timer lama dibatalkan
// bila user menyalin ulang sebelum pil konfirmasi hilang, jadi klik
// beruntun selalu menampilkan konfirmasi segar.
export function useCopy(resetMs = 1400) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  // Bersihkan timer saat unmount supaya tidak ada setState pada komponen
  // yang sudah dilepas.
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text) => {
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          ok = true;
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.top = "-10px";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          ta.setSelectionRange(0, ta.value.length);
          ok = document.execCommand("copy");
          ta.remove();
        }
      } catch {
        ok = false;
      }
      if (ok) {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetMs);
      }
      return ok;
    },
    [resetMs]
  );

  return { copied, copy };
}
