'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  Camera,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ScanLine,
  FlipHorizontal,
  Sparkles,
  Zap,
  ZapOff,
  Cpu,
  Target
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

// 1. Retail 1D & 2D formats for ZXing (restricting formats avoids wasted CPU cycles on irrelevant symbologies)
const ZXING_RETAIL_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

// 2. Retail format names for modern hardware-accelerated BarcodeDetector
const NATIVE_RETAIL_FORMATS: string[] = [
  'ean_13',
  'ean_8',
  'code_128',
  'upc_a',
  'upc_e',
  'code_39',
  'itf',
  'qr_code',
];

// Pre-configured ZXing hints with aggressive distant detection (TRY_HARDER)
const zxingHints = new Map<DecodeHintType, any>();
zxingHints.set(DecodeHintType.TRY_HARDER, true);
zxingHints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_RETAIL_FORMATS);

interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox?: DOMRectReadOnly;
}

interface BarcodeDetectorInstance {
  detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): BarcodeDetectorInstance;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

export function CameraBarcodeScannerModal({
  isOpen,
  onClose,
  onScan,
  title = 'مسح وقراءة باركود المنتج بالكاميرا'
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const currentTrackRef = useRef<MediaStreamTrack | null>(null);
  const activeLoopStopRef = useRef<(() => void) | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isScannedRef = useRef<boolean>(false);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [scanEngine, setScanEngine] = useState<'hardware' | 'zxing'>('zxing');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Play crisp dual-harmonic audio beep feedback
  const playBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Crisp high-frequency dual chime (Honeywell/Zebra style)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1760, now); // A6
      osc1.frequency.setValueAtTime(2637, now + 0.05); // E7

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, now);
      osc2.frequency.setValueAtTime(1320, now + 0.05);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.13);
      osc2.stop(now + 0.13);
    } catch {
      // Audio context might be restricted before user gesture
    }
  }, []);

  // Stop camera tracks and cancel scan loops cleanly
  const stopScanning = useCallback(() => {
    // 1. Stop native RAF scanning loop
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (activeLoopStopRef.current) {
      activeLoopStopRef.current();
      activeLoopStopRef.current = null;
    }

    // 2. Stop ZXing controls
    try {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    } catch {
      // ignore
    }

    // 3. Stop MediaStream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }

    // 4. Detach video element source
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    currentTrackRef.current = null;
    setTorchOn(false);
    setHasTorch(false);
  }, []);

  // Handle successful barcode scan with audio/haptic feedback and visual confirmation
  const handleBarcodeScanned = useCallback((codeText: string) => {
    if (isScannedRef.current) return;
    isScannedRef.current = true;

    setScannedCode(codeText);
    playBeep();

    // Haptic feedback (supported on Android/Chrome mobile)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([60, 40, 60]);
      } catch {}
    }

    // Freeze video display temporarily so user sees what was captured
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {}
    }

    // Deliver result smoothly after visual confirmation
    setTimeout(() => {
      stopScanning();
      onScan(codeText);
      onClose();
    }, 450);
  }, [playBeep, stopScanning, onScan, onClose]);

  // Toggle flashlight / torch if supported by camera track
  const toggleTorch = useCallback(async () => {
    const track = currentTrackRef.current;
    if (!track) return;
    try {
      const nextState = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextState } as any]
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle not supported or failed:', err);
    }
  }, [torchOn]);

  // Start Camera Stream with optimized constraints & modern BarcodeDetector / ZXing fallback
  const startScanning = useCallback(async (deviceId?: string) => {
    if (!videoRef.current) return;
    setIsLoading(true);
    setErrorMessage(null);
    setScannedCode(null);
    isScannedRef.current = false;

    stopScanning();

    try {
      // Enumerate available video devices
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoDevs = allDevices.filter(d => d.kind === 'videoinput');
          setVideoDevices(videoDevs);

          // If no deviceId specified, prioritize environment/rear camera
          if (!deviceId && videoDevs.length > 0) {
            const backCam = videoDevs.find(d => {
              const label = d.label.toLowerCase();
              return (
                label.includes('back') ||
                label.includes('rear') ||
                label.includes('environment') ||
                label.includes('خلفية')
              );
            });
            if (backCam) {
              deviceId = backCam.deviceId;
              setSelectedDeviceId(deviceId);
            }
          }
        }
      } catch {
        // Fallback if device enumeration is blocked before permission
      }

      // Optimize video constraints:
      // High resolution (1920x1080 ideal, min 1280x720) gives rich pixel detail for distant barcodes
      const preferredConstraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          facingMode: deviceId ? undefined : { ideal: 'environment' },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
        audio: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
      } catch (constraintErr: any) {
        // If min resolution is overconstrained on older devices/webcams, fallback gracefully
        console.warn('Strict resolution overconstrained, falling back to standard resolution:', constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: deviceId ? undefined : { ideal: 'environment' },
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
          audio: false,
        });
      }

      streamRef.current = stream;

      // Enable continuous autofocus if supported by track capabilities
      const track = stream.getVideoTracks()[0];
      if (track) {
        currentTrackRef.current = track;
        try {
          const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
          if (capabilities.torch) {
            setHasTorch(true);
          }
          const advanced: any[] = [];
          if (
            capabilities.focusMode &&
            Array.isArray(capabilities.focusMode) &&
            capabilities.focusMode.includes('continuous')
          ) {
            advanced.push({ focusMode: 'continuous' });
          }
          if (advanced.length > 0) {
            await track.applyConstraints({ advanced });
          }
        } catch (focusErr) {
          console.debug('Continuous autofocus constraint skipped:', focusErr);
        }
      }

      // Attach stream to video preview
      const videoElem = videoRef.current;
      videoElem.srcObject = stream;
      await videoElem.play().catch(() => {});

      // 3. Modern Hardware-Accelerated BarcodeDetector (Chrome/Edge/Android)
      let nativeDetectorActive = false;
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window && window.BarcodeDetector) {
        try {
          let formatsToUse = NATIVE_RETAIL_FORMATS;
          if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
            const supported = await window.BarcodeDetector.getSupportedFormats();
            formatsToUse = NATIVE_RETAIL_FORMATS.filter(f => supported.includes(f));
          }

          if (formatsToUse.length > 0) {
            const detector = new window.BarcodeDetector({ formats: formatsToUse });
            setScanEngine('hardware');
            nativeDetectorActive = true;

            let isRunning = true;
            let isDetecting = false;
            activeLoopStopRef.current = () => {
              isRunning = false;
            };

            const scanLoop = async () => {
              if (!isRunning || isScannedRef.current) return;

              if (videoElem && videoElem.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !isDetecting) {
                isDetecting = true;
                try {
                  const barcodes = await detector.detect(videoElem);
                  if (barcodes && barcodes.length > 0) {
                    const matched = barcodes[0].rawValue?.trim();
                    if (matched) {
                      isRunning = false;
                      handleBarcodeScanned(matched);
                      return;
                    }
                  }
                } catch {
                  // Ignore frame drop
                } finally {
                  isDetecting = false;
                }
              }

              if (isRunning && !isScannedRef.current) {
                rafIdRef.current = requestAnimationFrame(scanLoop);
              }
            };

            rafIdRef.current = requestAnimationFrame(scanLoop);
          }
        } catch (nativeErr) {
          console.warn('BarcodeDetector initialization failed, falling back to ZXing:', nativeErr);
          nativeDetectorActive = false;
        }
      }

      // Seamless fallback to optimized ZXing BrowserMultiFormatReader
      if (!nativeDetectorActive) {
        setScanEngine('zxing');

        const codeReader = new BrowserMultiFormatReader(zxingHints, {
          delayBetweenScanAttempts: 40, // 25 scans per second for high-speed detection
          delayBetweenScanSuccess: 500,
        });
        readerRef.current = codeReader;

        const controls = await codeReader.decodeFromStream(
          stream,
          videoElem,
          (result, err) => {
            if (result && !isScannedRef.current) {
              const rawText = result.getText()?.trim();
              if (rawText) {
                handleBarcodeScanned(rawText);
              }
            }
          }
        );

        controlsRef.current = controls;
      }

      setIsLoading(false);
    } catch (err: any) {
      console.error('Camera Scanner Error:', err);
      setIsLoading(false);
      if (err.name === 'NotAllowedError' || err.message?.includes('denied')) {
        setErrorMessage('تم رفض الإذن بالوصول إلى الكاميرا. يرجى تفعيل إذن الكاميرا من إعدادات المتصفح.');
      } else if (err.name === 'NotFoundError') {
        setErrorMessage('لم يتم العثور على كاميرا متصلة بالجهاز.');
      } else {
        setErrorMessage(err.message || 'تعذر تشغيل الكاميرا للمسح، يمكنك كتابة الباركود يدوياً.');
      }
    }
  }, [handleBarcodeScanned, stopScanning]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        startScanning(selectedDeviceId);
      }, 100);
      return () => {
        clearTimeout(timer);
        stopScanning();
      };
    } else {
      stopScanning();
    }
  }, [isOpen, selectedDeviceId, startScanning, stopScanning]);

  const handleSwitchCamera = () => {
    if (videoDevices.length <= 1) return;
    const currentIndex = videoDevices.findIndex(d => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextIndex];
    setSelectedDeviceId(nextDevice.deviceId);
    startScanning(nextDevice.deviceId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
      <style>{`
        @keyframes scanSweep {
          0% { top: 6%; opacity: 0.8; }
          50% { top: 92%; opacity: 1; }
          100% { top: 6%; opacity: 0.8; }
        }
        .animate-scan-sweep {
          animation: scanSweep 2s ease-in-out infinite;
        }
      `}</style>

      <div className="bg-zinc-950 text-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-zinc-800 animate-fade-in relative space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#E6007E] to-pink-500 flex items-center justify-center text-white shadow-md shadow-pink-500/25">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-zinc-100 flex items-center gap-1.5">
                <span>{title}</span>
                <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              </h3>
              <p className="text-[11px] text-zinc-400 font-medium">
                مسح فائق السرعة يدعم القراءة عن بعد لكافة باركودات المنتجات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopScanning();
              onClose();
            }}
            className="p-1.5 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewport */}
        <div className="relative aspect-[4/3] sm:aspect-square w-full bg-black rounded-2xl overflow-hidden border-2 border-zinc-800 flex items-center justify-center shadow-inner">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Engine & Status Badge */}
          {!isLoading && !errorMessage && !scannedCode && (
            <div className="absolute top-3 inset-x-3 flex items-center justify-between z-10 pointer-events-none">
              <div className="bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-zinc-700/80 flex items-center gap-1.5 text-[11px] font-bold">
                {scanEngine === 'hardware' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">مسح عتادي نشط (60 FPS)</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
                    <Target className="w-3.5 h-3.5 text-pink-400" />
                    <span className="text-pink-300">محرك ZXing فائق الدقة (1080p)</span>
                  </>
                )}
              </div>

              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`pointer-events-auto p-1.5 rounded-full border backdrop-blur-md transition cursor-pointer ${
                    torchOn
                      ? 'bg-amber-500 border-amber-300 text-black shadow-lg shadow-amber-500/40'
                      : 'bg-black/60 border-zinc-700 text-zinc-300 hover:text-white'
                  }`}
                  title={torchOn ? 'إطفاء الفلاش' : 'تشغيل الفلاش'}
                >
                  {torchOn ? <Zap className="w-4 h-4 fill-black" /> : <ZapOff className="w-4 h-4" />}
                </button>
              )}
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="absolute inset-0 bg-zinc-950/90 flex flex-col items-center justify-center gap-3 text-zinc-300 z-20">
              <RefreshCw className="w-8 h-8 text-[#E6007E] animate-spin" />
              <p className="text-xs font-bold font-sans">جاري ضبط الكاميرا بدقة 1080p والتركيز التلقائي...</p>
            </div>
          )}

          {/* Success Flash View */}
          {scannedCode && (
            <div className="absolute inset-0 bg-emerald-950/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 text-white animate-fade-in z-30">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xl shadow-emerald-500/30">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <p className="text-sm font-black font-sans">تمت قراءة الباركود بنجاح!</p>
              <span className="font-mono font-bold text-lg bg-black/70 px-4 py-1.5 rounded-xl border border-emerald-400 text-emerald-300 tracking-wider shadow-inner" dir="ltr">
                {scannedCode}
              </span>
            </div>
          )}

          {/* Error View */}
          {errorMessage && (
            <div className="absolute inset-0 bg-zinc-950/95 p-6 flex flex-col items-center justify-center text-center gap-3 text-rose-300 z-30">
              <AlertCircle className="w-10 h-10 text-rose-500" />
              <p className="text-xs font-bold leading-relaxed">{errorMessage}</p>
              <button
                type="button"
                onClick={() => startScanning(selectedDeviceId)}
                className="mt-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة المحاولة</span>
              </button>
            </div>
          )}

          {/* High-Contrast Aiming Box & Viewfinder with Animated Laser */}
          {!isLoading && !errorMessage && !scannedCode && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* High-contrast dimmed target area with deep shadow mask */}
              <div className="relative w-64 h-36 sm:w-80 sm:h-44 border border-white/20 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] overflow-hidden">
                {/* 4 Illuminated Corner Highlights with brand glow */}
                <span className="absolute top-0 start-0 w-6 h-6 border-t-[3px] border-s-[3px] border-[#E6007E] rounded-tl-xl shadow-[0_0_8px_#E6007E]" />
                <span className="absolute top-0 end-0 w-6 h-6 border-t-[3px] border-e-[3px] border-[#E6007E] rounded-tr-xl shadow-[0_0_8px_#E6007E]" />
                <span className="absolute bottom-0 start-0 w-6 h-6 border-b-[3px] border-s-[3px] border-[#E6007E] rounded-bl-xl shadow-[0_0_8px_#E6007E]" />
                <span className="absolute bottom-0 end-0 w-6 h-6 border-b-[3px] border-e-[3px] border-[#E6007E] rounded-br-xl shadow-[0_0_8px_#E6007E]" />

                {/* Center Aiming Reticle Guide */}
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                  <div className="w-10 h-[1px] bg-white" />
                  <div className="h-10 w-[1px] bg-white -ms-[5px]" />
                </div>

                {/* Laser Sweep Glow Aura */}
                <div className="absolute inset-x-2 h-10 pointer-events-none -translate-y-1/2 animate-scan-sweep bg-gradient-to-b from-transparent via-pink-500/15 to-transparent" />

                {/* Animated Laser Scan Line */}
                <div className="absolute inset-x-2 h-[2.5px] bg-gradient-to-r from-transparent via-[#E6007E] to-transparent shadow-[0_0_14px_#E6007E,0_0_4px_#ffffff] animate-scan-sweep pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls & Instructions */}
        <div className="space-y-3">
          <div className="bg-zinc-900/90 p-3 rounded-2xl border border-zinc-800 text-[11px] text-zinc-300 font-medium leading-relaxed flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-[#E6007E] shrink-0" />
            <span>
              وجّه الكاميرا نحو باركود الصنف داخل الإطار. يدعم المسح القراءة السريعة من مسافة 15-40 سم بدقة عالية.
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              {videoDevices.length > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="py-2.5 px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                >
                  <FlipHorizontal className="w-4 h-4 text-pink-400" />
                  <span>تبديل الكاميرا ({videoDevices.length})</span>
                </button>
              )}

              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`py-2.5 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    torchOn
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm shadow-amber-500/20'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {torchOn ? (
                    <>
                      <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span>إطفاء الفلاش</span>
                    </>
                  ) : (
                    <>
                      <ZapOff className="w-4 h-4 text-zinc-400" />
                      <span>فلاش الإضاءة</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                stopScanning();
                onClose();
              }}
              className="ms-auto py-2.5 px-5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-bold transition cursor-pointer"
            >
              إلغاء وإغلاق
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
