import React from "react";

export default function Toast({ message }) {
  return (
    <div className="kd-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
