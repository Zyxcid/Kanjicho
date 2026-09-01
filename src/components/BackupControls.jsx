/**
 * BackupControls — tombol Export/Import progress, dipasang di modal Help.
 *
 * Export: unduh seluruh progress (3 tabel IndexedDB + pengaturan tampilan)
 * sebagai satu file JSON. Import: pilih file backup, konfirmasi, lalu
 * SELURUH progress perangkat ini diganti isinya. Logika lengkapnya ada di
 * lib/backup.js — komponen ini hanya UI-nya.
 *
 * Label sengaja bahasa Inggris agar konsisten dengan teks UI aplikasi
 * lainnya (modal Help, tombol kuis, dsb.).
 */
import React, { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { exportProgress, readBackup, applyBackup } from "../lib/backup";

export default function BackupControls() {
  const fileRef = useRef(null);

  async function handleExport() {
    try {
      await exportProgress();
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset input agar file yang sama bisa dipilih ulang
    if (!file) return;

    // Konfirmasi wajib: impor mengganti SELURUH progress saat ini.
    if (
      !window.confirm(
        "Importing replaces ALL progress on this device with the backup file.\nContinue?"
      )
    ) {
      return;
    }

    try {
      await applyBackup(await readBackup(file));
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  }

  return (
    <div className="kd-help-links">
      <button className="kd-help-btn" onClick={handleExport}>
        <Download size={15} /> Export progress
      </button>
      <button className="kd-help-btn" onClick={() => fileRef.current?.click()}>
        <Upload size={15} /> Import progress
      </button>
      {/* input file tersembunyi — tombol Import yang mengkliknya, supaya
          tampilannya konsisten dengan tombol Export */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={handleFile}
      />
    </div>
  );
}
