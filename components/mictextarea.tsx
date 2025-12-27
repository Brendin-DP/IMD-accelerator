"use client";

import * as React from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

export function MicTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: Props) {
  const [isListening, setIsListening] = React.useState(false);
  const [supported, setSupported] = React.useState(true);
  const recognitionRef = React.useRef<any>(null);
  const holdActiveRef = React.useRef(false);

  React.useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true; // keep going while held
    recognition.interimResults = true; // live partial text
    recognition.lang = "en-US"; // change if needed

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }

      // Append to existing answer (keeps it safe)
      const next = (value + " " + (finalText || interimText)).replace(/\s+/g, " ").trimStart();
      onChange(next);
    };

    recognition.onerror = () => {
      // Don’t hard-fail the UI — just stop listening
      setIsListening(false);
      holdActiveRef.current = false;
    };

    recognition.onend = () => {
      setIsListening(false);

      // If the user is still holding, restart (some browsers auto-stop)
      if (holdActiveRef.current) {
        try {
          recognition.start();
          setIsListening(true);
        } catch {
          // ignore
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    if (disabled || !supported) return;
    holdActiveRef.current = true;

    try {
      recognitionRef.current?.start();
      setIsListening(true);
    } catch {
      // "already started" errors happen sometimes; ignore
      setIsListening(true);
    }
  };

  const stop = () => {
    holdActiveRef.current = false;

    try {
      recognitionRef.current?.stop();
    } catch {}

    setIsListening(false);
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full min-h-[120px] rounded-md border px-3 py-2 pr-12 text-sm"
      />

      <button
        type="button"
        disabled={disabled || !supported}
        aria-label={supported ? "Hold to record" : "Speech-to-text not supported"}
        onPointerDown={(e) => {
          e.preventDefault();
          start();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          stop();
        }}
        onPointerLeave={(e) => {
          e.preventDefault();
          stop();
        }}
        className={`absolute right-2 top-2 h-9 w-9 rounded-md border text-sm
          ${!supported ? "opacity-50 cursor-not-allowed" : ""}
          ${isListening ? "ring-2 ring-offset-2" : ""}
        `}
      >
        🎤
      </button>

      {!supported && (
        <p className="mt-2 text-xs text-muted-foreground">
          Speech-to-text isn’t supported in this browser (works best in Chrome).
        </p>
      )}

      {isListening && supported && (
        <p className="mt-2 text-xs text-muted-foreground">
          Recording… (hold to keep talking)
        </p>
      )}
    </div>
  );
}