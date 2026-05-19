/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import QRCode from "react-qr-code";
import jsQR from "jsqr";
import { 
  Camera, 
  Heart, 
  Share2, 
  Info, 
  ArrowRight, 
  ArrowLeft,
  Maximize2,
  Minimize2,
  User, 
  UserPlus,
  Users,
  Upload, 
  CheckCircle2, 
  ShieldAlert,
  Download, 
  LayoutGrid,
  Filter, 
  Settings2,
  Settings,
  Calendar,
  X,
  Loader2,
  Image as ImageIcon,
  Plus,
  Minus,
  Search,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Smile,
  Zap,
  Globe,
  QrCode,
  Home,
  Wand2,
  MessageSquare,
  Sparkles
} from "lucide-react";
import { useState, useRef, useEffect, ChangeEvent } from "react";
import { auth, db, signInWithGoogle } from "./lib/firebase";
import { onAuthStateChanged, User as FirebaseUser, signOut, updateProfile } from "firebase/auth";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  updateDoc, 
  serverTimestamp,
  getDoc,
  setDoc
} from "firebase/firestore";

type Step = "welcome" | "weddings" | "upload" | "verify" | "gallery" | "profile";

interface Wedding {
  id: string;
  name: string;
  date: string;
  ownerId: string;
  watermarkEnabled: boolean;
  watermarkText?: string;
  watermarkPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  watermarkOpacity?: number;
  watermarkBg?: string;
  watermarkTextSize?: number;
  liquidGlassEnabled?: boolean;
  photoBlur?: number;
  coverUrl?: string;
  sharingLimit: "1h" | "10h" | "1d" | "unlimited";
}

interface Photo {
  id: string;
  url: string;
  name: string;
  weddingId: string;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [step, setStep] = useState<Step>("welcome");
  const [isDark, setIsDark] = useState(true);
  const [activeTab, setActiveTab] = useState("home");
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; message: string }[]>([]);
  const [weddings, setWeddings] = useState<Wedding[]>([]);
  const [currentWedding, setCurrentWedding] = useState<Wedding | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<Photo[]>([]);
  const [matchedIndices, setMatchedIndices] = useState<number[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [networkView, setNetworkView] = useState<"followers" | "following">("followers");
  const [uploadSpeed, setUploadSpeed] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showNav, setShowNav] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [showSelectionsOnly, setShowSelectionsOnly] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showWatermarkModal, setShowWatermarkModal] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [savedPhotos, setSavedPhotos] = useState<Photo[]>([]);
  const [showControls, setShowControls] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newWeddingData, setNewWeddingData] = useState({ name: "", date: "", sharingLimit: "unlimited" as const, coverUrl: "" });
  const [selfie, setSelfie] = useState<string | null>(null);
  const [profileTitle, setProfileTitle] = useState("");
  const [profileAbout, setProfileAbout] = useState("");
  const [profileFavoriteSubject, setProfileFavoriteSubject] = useState("");
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [collectionSummary, setCollectionSummary] = useState<string | null>(null);
  const [isGeneratingToast, setIsGeneratingToast] = useState(false);
  const [generatedToast, setGeneratedToast] = useState<string | null>(null);
  const [toastRelationship, setToastRelationship] = useState("Friend");
  const [toastTone, setToastTone] = useState("Humorous");
  const [toastMemory, setToastMemory] = useState("");
  const [showToastAssistant, setShowToastAssistant] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const profilePicRef = useRef<HTMLInputElement>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingWedding, setEditingWedding] = useState<Wedding | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinId, setJoinId] = useState("");
  const [hideEventCode, setHideEventCode] = useState(false);
  const [isUiVisible, setIsUiVisible] = useState(true);
  const [cameraInitialMode, setCameraInitialMode] = useState<"photo" | "qr">("photo");

  const handleJoinWedding = async () => {
    if (!joinId || !user) return;
    try {
      const docRef = doc(db, "weddings", joinId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const wedding = { id: docSnap.id, ...docSnap.data() } as Wedding;
        setCurrentWedding(wedding);
        setStep("gallery");
        setShowJoinModal(false);
        setJoinId("");
        showNotification(`Sanctuary "${wedding.name}" synchronized`);
      } else {
        showNotification("Invalid protocol ID");
      }
    } catch (e) {
      console.error(e);
      showNotification("Synchronization failed");
    }
  };

  const handleQRScanJoin = async (scannedData: string) => {
    if (!user) return;
    
    let targetId = scannedData;
    // Handle full URLs (e.g. from shared wedding link)
    if (scannedData.includes('/v/')) {
      targetId = scannedData.split('/v/').pop() || scannedData;
    }
    
    // Remove any trailing slashes or parameters
    targetId = targetId.split('?')[0].split('#')[0].replace(/\/$/, "");

    try {
      const docRef = doc(db, "weddings", targetId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const wedding = { id: docSnap.id, ...docSnap.data() } as Wedding;
        setCurrentWedding(wedding);
        setStep("gallery");
        setShowCamera(false);
        showNotification(`Synchronized with "${wedding.name}" Protocol`);
      } else {
        // Fallback: If it's a UID, we might want a different behavior
        // But for "work from gallery", we expect wedding IDs
        showNotification("Unrecognized Protocol ID");
      }
    } catch (e) {
      console.error("QR Scan Error:", e);
      showNotification("Neural link synchronization failed");
    }
  };

  // Fetch profile data when entering profile step
  useEffect(() => {
    if (step === "profile" && user) {
      const fetchProfile = async () => {
        const docRef = doc(db, "profiles", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfileTitle(data.title || "");
          setProfileAbout(data.about || "");
          setProfileFavoriteSubject(data.favoriteSubject || "");
          if (data.savedPhotos) {
            setSavedPhotos(data.savedPhotos);
          }
        }
      };
      fetchProfile();
    }
  }, [step, user]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowNav(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Handle scroll to show/hide nav based on user direction
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // If scrolling up, hide. If scrolling down, show.
      if (currentScrollY < lastScrollY && currentScrollY > 50) {
        setShowNav(false);
      } else if (currentScrollY > lastScrollY || currentScrollY <= 50) {
        setShowNav(true);
      }
      
      setLastScrollY(currentScrollY);

      // Reset timer to show after 5s of no scrolling (stalling) if it was hidden
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setShowNav(true);
      }, 5000);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timeoutId);
    };
  }, [lastScrollY]);

  useEffect(() => {
    let unsubWeddings: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Fetch ALL weddings for discovery
        const q = query(collection(db, "weddings"));
        unsubWeddings = onSnapshot(q, 
          (snapshot) => {
            setWeddings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Wedding)));
          },
          (error) => {
            console.error("Weddings listener error:", error);
          }
        );
      } else {
        if (unsubWeddings) unsubWeddings();
        setWeddings([]);
        setStep("welcome");
      }
    });
    return () => {
      unsubscribe();
      if (unsubWeddings) unsubWeddings();
    };
  }, []);

  useEffect(() => {
    if (currentWedding) {
      const q = query(collection(db, "weddings", currentWedding.id, "photos"));
      const unsubPhotos = onSnapshot(q, 
        (snapshot) => {
          setUploadedPhotos(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Photo)));
        },
        (error) => {
          console.error("Photos listener error:", error);
        }
      );
      return () => unsubPhotos();
    }
  }, [currentWedding]);

  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
        try {
          const docRef = doc(db, "profiles", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setProfileTitle(docSnap.data().title || "");
          }
        } catch (error) {
          console.error("Profile fetch skipped or failed (offline):", error);
        }
      };
      fetchProfile();
    }
  }, [user]);

  const showNotification = (message: string) => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem("onboarding_complete");
    if (!hasSeenOnboarding) {
      setOnboardingStep(0);
    }
  }, []);

  const completeOnboarding = () => {
    setOnboardingStep(null);
    localStorage.setItem("onboarding_complete", "true");
    showNotification("Welcome to E. Moments");
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      showNotification("Session terminated safely");
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  const handleCreateWedding = async () => {
    if (!user || !newWeddingData.name || !newWeddingData.date) return;

    try {
      const docRef = await addDoc(collection(db, "weddings"), {
        ...newWeddingData,
        ownerId: user.uid,
        watermarkEnabled: true,
        watermarkText: "E. Moments",
        watermarkPosition: "center",
        watermarkOpacity: 0.4,
        watermarkBg: "transparent",
        watermarkTextSize: 24,
        liquidGlassEnabled: false,
        photoBlur: 0,
        createdAt: serverTimestamp(),
      });
      
      const newWed = { 
        id: docRef.id, 
        ...newWeddingData, 
        ownerId: user.uid,
        watermarkEnabled: true,
        watermarkText: "E. Moments",
        watermarkPosition: "center",
        watermarkOpacity: 0.4,
        watermarkBg: "transparent",
        watermarkTextSize: 24,
        liquidGlassEnabled: false,
        photoBlur: 0
      } as Wedding;
      
      setCurrentWedding(newWed);
      setShowCreateModal(false);
      setNewWeddingData({ name: "", date: "", sharingLimit: "unlimited", coverUrl: "" });
      setStep("upload");
      showNotification("Registry established. Transmission enabled.");
    } catch (e) {
      console.error(e);
    }
  };

  const handleFolderUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !currentWedding || !user) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadSpeed("0 KB/s");
    
    try {
      const fileArray = Array.from(files) as File[];
      const totalFiles = fileArray.length;
      let count = 0;
      
      const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });

      for (const file of fileArray) {
        const startTime = performance.now();
        const base64Url = await toBase64(file);
        const photoData = {
          url: base64Url,
          name: file.name,
          weddingId: currentWedding.id,
          uploadedBy: user.uid,
          createdAt: serverTimestamp(),
        };
        
        await addDoc(collection(db, "weddings", currentWedding.id, "photos"), photoData);
        
        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000; // seconds
        const fileSize = file.size / 1024; // KB
        const speed = duration > 0 ? (fileSize / duration).toFixed(1) : "0";
        
        setUploadSpeed(`${speed} KB/s`);
        count++;
        setUploadProgress(Math.round((count / totalFiles) * 100));
      }
      showNotification(`Archived ${count} memories`);
    } catch (e) {
      console.error(e);
      showNotification("Upload failed");
    } finally {
      setIsUploading(false);
      setUploadSpeed(null);
      setUploadProgress(0);
    }
  };

  const handleCameraCapture = async (dataUrl: string) => {
    if (!currentWedding || !user) return;
    setIsUploading(true);
    try {
      const photoData = {
        url: dataUrl,
        name: `capture_${Date.now()}.jpg`,
        weddingId: currentWedding.id,
        uploadedBy: user.uid,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "weddings", currentWedding.id, "photos"), photoData);
      showNotification("Memory captured and archived");
    } catch (e) {
      console.error(e);
      showNotification("Transmission failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleVerifyFace = async (selfieDataUrl: string) => {
    if (!currentWedding || uploadedPhotos.length === 0) {
      setStep("gallery");
      return;
    }
    
    setIsVerifying(true);
    setSelfie(selfieDataUrl);
    try {
      const resp = await fetch(selfieDataUrl);
      const blob = await resp.blob();
      const formData = new FormData();
      formData.append("selfie", blob, "selfie.jpg");
      
      const weddingPhotos = uploadedPhotos.filter(p => p.weddingId === currentWedding.id);
      formData.append("galleryUrls", JSON.stringify(weddingPhotos.slice(0, 15).map(p => p.url)));

      const response = await fetch("/api/verify-face", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("API failure");
      const data = await response.json();
      
      if (data.matchedIndices) {
        const realIndices = data.matchedIndices.map((relIdx: number) => {
          const photo = weddingPhotos.slice(0, 15)[relIdx];
          return uploadedPhotos.findIndex(p => p.url === photo.url);
        }).filter((idx: number) => idx !== -1);
        
        setMatchedIndices(realIndices.length > 0 ? realIndices : []);
        setStep("gallery");
        showNotification(realIndices.length > 0 ? `Found ${realIndices.length} matches` : "No matches in scan range");
      }
    } catch (e) {
      console.error(e);
      showNotification("Biometric scan failed");
      setStep("gallery");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSelfieUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentWedding) return;

    if (selfie) try { URL.revokeObjectURL(selfie); } catch(e) {}
    const url = URL.createObjectURL(file);
    handleVerifyFace(url);
  };

  const downloadPhoto = (photo: Photo) => {
    const link = document.createElement("a");
    link.href = photo.url;
    link.download = `eternal-moment-${photo.id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadQRCode = (id: string, name: string) => {
    const svg = document.getElementById(id);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = 600;
      canvas.height = 600;
      ctx!.fillStyle = "white";
      ctx!.fillRect(0, 0, canvas.width, canvas.height);
      ctx!.drawImage(img, 50, 50, 500, 500);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `${name}-qr.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleProfilePicUpdate = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUpdatingProfile(true);
    try {
      const url = URL.createObjectURL(file);
      await updateProfile(user, { photoURL: url });
      setUser({ ...user, photoURL: url } as FirebaseUser); // Trigger local update
      showNotification("Aesthetic signature updated");
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsUpdatingProfile(true);
    try {
      await setDoc(doc(db, "profiles", user.uid), {
        title: profileTitle,
        about: profileAbout,
        favoriteSubject: profileFavoriteSubject,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showNotification("Identity protocols updated");
      setShowProfileSettings(false);
    } catch (e) {
      console.error(e);
      showNotification("Update failed");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleDownloadPhoto = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      showNotification("Masterpiece downloaded");
    } catch (e) {
      console.error(e);
      showNotification("Download failed");
    }
  };

  const handleUpdateWedding = async () => {
    if (!user || !editingWedding) return;
    try {
      await updateDoc(doc(db, "weddings", editingWedding.id), {
        name: editingWedding.name,
        date: editingWedding.date,
        sharingLimit: editingWedding.sharingLimit,
        coverUrl: editingWedding.coverUrl || "",
        updatedAt: serverTimestamp(),
      });
      setShowEditModal(false);
      setEditingWedding(null);
      showNotification("Registry protocols revised");
    } catch (e) {
      console.error(e);
      showNotification("Protocol update failed");
    }
  };

  const handleSummarizeCollection = async () => {
    if (!currentWedding || uploadedPhotos.length === 0) return;
    
    setIsSummarizing(true);
    setCollectionSummary(null);
    try {
      const getBase64 = async (url: string): Promise<string> => {
        if (url.startsWith('data:')) return url;
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          return url;
        }
      };

      // Only take the first few images to avoid massive payloads
      const imagesToSummarize = uploadedPhotos.slice(0, 8);
      const base64Images = await Promise.all(imagesToSummarize.map(p => getBase64(p.url)));

      const response = await fetch("/api/summarize-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrls: base64Images,
          weddingName: currentWedding.name
        }),
      });
      
      const data = await response.json();
      if (data.summary) {
        setCollectionSummary(data.summary);
        showNotification("Aesthetic analysis complete");
      }
    } catch (e) {
      console.error("Summarization error:", e);
      showNotification("Analysis failed");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGenerateToast = async () => {
    if (!currentWedding) return;
    
    setIsGeneratingToast(true);
    setGeneratedToast(null);
    try {
      const response = await fetch("/api/generate-toast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationship: toastRelationship,
          tone: toastTone,
          memory: toastMemory,
          weddingName: currentWedding.name
        }),
      });
      
      const data = await response.json();
      if (data.toast) {
        setGeneratedToast(data.toast);
        showNotification("Masterpiece composed");
      }
    } catch (e) {
      console.error("Toast generation error:", e);
      showNotification("Composition failed");
    } finally {
      setIsGeneratingToast(false);
    }
  };

  const toggleWatermark = async () => {
    if (!currentWedding) return;
    const nextState = !currentWedding.watermarkEnabled;
    try {
      if (user && currentWedding.ownerId === user.uid) {
        await updateDoc(doc(db, "weddings", currentWedding.id), {
          watermarkEnabled: nextState
        });
      }
      setCurrentWedding(prev => prev ? { ...prev, watermarkEnabled: nextState } : null);
    } catch (e) {
      console.error(e);
    }
  };

  const updateWatermarkSettings = async (settings: Partial<Wedding>) => {
    if (!currentWedding || !user || currentWedding.ownerId !== user.uid) return;
    try {
      await updateDoc(doc(db, "weddings", currentWedding.id), settings);
      setCurrentWedding(prev => prev ? { ...prev, ...settings } : null);
    } catch (e) {
      console.error(e);
    }
  };

  const matchedPhotos = (matchedIndices.length > 0) 
    ? matchedIndices.map(index => uploadedPhotos[index]).filter(Boolean)
    : (step === 'gallery' ? uploadedPhotos : []);

  const CameraCapture = ({ onCapture, onClose, onScan, accessKeyId, initialMode = "photo" }: { onCapture: (url: string) => void, onClose: () => void, onScan?: (data: string) => void, accessKeyId?: string, initialMode?: "photo" | "qr" }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isStarting, setIsStarting] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
    const [mode, setMode] = useState<"photo" | "qr">(initialMode);
    const [isMinimized, setIsMinimized] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);

    useEffect(() => {
      async function startCamera() {
        try {
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
          const mStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: facingMode, 
              width: { ideal: 1920 }, 
              height: { ideal: 1080 } 
            } 
          });
          setStream(mStream);
          if (videoRef.current) {
            videoRef.current.srcObject = mStream;
          }
          setIsStarting(false);
        } catch (err: any) {
          console.error("Camera error:", err);
          setError("Neural link failed. Hardware might be disconnected or sensor access revoked.");
          setIsStarting(false);
        }
      }
      startCamera();
      return () => {
        stream?.getTracks().forEach(track => track.stop());
      };
    }, [facingMode]);

    useEffect(() => {
      let animationFrameId: number;
      let lastScannedData: string | null = null;

      const scanCode = () => {
        if (mode === "qr" && videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
              });
              if (code && code.data !== lastScannedData) {
                lastScannedData = code.data;
                if (onScan) {
                   onScan(code.data);
                } else {
                   setScanResult(code.data);
                }
              }
            }
          }
        }
        animationFrameId = requestAnimationFrame(scanCode);
      };
      
      if (mode === "qr") {
        animationFrameId = requestAnimationFrame(scanCode);
      }
      return () => cancelAnimationFrame(animationFrameId);
    }, [mode, onScan]);

    const toggleFacingMode = () => {
      setFacingMode(prev => prev === "user" ? "environment" : "user");
    };

    const capture = () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
          onCapture(dataUrl);
          stream?.getTracks().forEach(track => track.stop());
        }
      }
    };

    return (
      <motion.div 
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed z-[500] transition-all duration-700 ${
          isMinimized 
            ? "right-6 bottom-32 w-48 h-64 rounded-3xl shadow-2xl overflow-hidden ring-4 ring-white/20" 
            : "inset-0 bg-black"
        }`}
      >
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="w-full h-full object-cover" 
        />
        <canvas ref={canvasRef} className="hidden" />

        {isStarting && !isMinimized && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/40 backdrop-blur-sm">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-indigo-400">Calibrating Sensor...</p>
          </div>
        )}

        {error && !isMinimized && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-10 text-center bg-stone-950">
             <div className="w-16 h-16 rounded-3xl bg-red-500/20 flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-red-100" />
             </div>
             <p className="text-red-100 text-sm max-w-xs">{error}</p>
             <button onClick={onClose} className="px-10 py-4 bg-white text-stone-900 rounded-2xl font-bold text-[10px] uppercase tracking-widest">Return</button>
          </div>
        )}

        {/* QR Overlay Controls */}
        {!isMinimized && mode === "qr" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-72 border border-white/20 rounded-[3rem] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-indigo-400 rounded-tl-2xl shadow-[0_0_20px_rgba(129,140,248,0.5)]" />
              <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-indigo-400 rounded-tr-2xl shadow-[0_0_20px_rgba(129,140,248,0.5)]" />
              <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-indigo-400 rounded-bl-2xl shadow-[0_0_20px_rgba(129,140,248,0.5)]" />
              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-indigo-400 rounded-br-2xl shadow-[0_0_20px_rgba(129,140,248,0.5)]" />
              <motion.div 
                initial={{ top: "0%" }}
                animate={{ top: "100%" }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                className="absolute left-0 right-0 h-[4px] bg-indigo-400 shadow-[0_0_30px_rgba(129,140,248,1)]"
              />
            </div>
            <div className="absolute bottom-40 flex flex-col items-center gap-3">
              <div className="px-4 py-2 bg-indigo-600 rounded-full border border-white/20 shadow-xl flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-white uppercase tracking-widest">Scanning Protocol</span>
              </div>
            </div>
          </div>
        )}

        {/* Top Control Bar */}
        <div className={`absolute top-12 left-0 right-0 px-8 flex items-center justify-between transition-all ${isMinimized ? "hidden" : "visible"}`}>
          <div className="glass-dark px-4 py-2 rounded-full border border-white/10 flex items-center gap-3">
            <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Protocol ID:</span>
            <span className="text-[10px] font-mono font-bold text-indigo-400">{accessKeyId || "UNNAMED"}</span>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMinimized(true)}
              className="w-12 h-12 rounded-full glass-dark text-white flex items-center justify-center hover:bg-stone-800 transition-all border border-white/10"
              title="Minimize to Side"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
            <button 
              onClick={onClose}
              className="w-12 h-12 rounded-full glass-dark text-white flex items-center justify-center hover:bg-red-500/20 transition-all border border-white/10"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Bottom Control Bar */}
        <div className={`absolute bottom-16 left-0 right-0 flex flex-col items-center gap-10 transition-all ${isMinimized ? "hidden" : "visible"}`}>
          <div className="flex bg-stone-900/80 p-1.5 rounded-full border border-white/10 shadow-2xl backdrop-blur-3xl">
            <button 
              onClick={() => setMode("photo")}
              className={`flex items-center gap-3 px-8 py-4 rounded-full transition-all ${mode === "photo" ? "bg-white text-stone-900" : "text-white/40 hover:text-white"}`}
            >
              <Camera className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Memoir</span>
            </button>
            <button 
              onClick={() => setMode("qr")}
              className={`flex items-center gap-3 px-8 py-4 rounded-full transition-all ${mode === "qr" ? "bg-white text-stone-900" : "text-white/40 hover:text-white"}`}
            >
              <QrCode className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Protocol</span>
            </button>
          </div>

          <div className="flex items-center justify-center gap-12">
            <button 
              onClick={toggleFacingMode}
              className="w-16 h-16 rounded-full glass-dark text-white flex items-center justify-center hover:bg-stone-800 transition-all border border-white/10"
            >
              <Zap className="w-6 h-6" />
            </button>

            <button 
              onClick={mode === "photo" ? capture : () => {}}
              disabled={mode === "qr"}
              className={`w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all group ${mode === "qr" ? "opacity-20 translate-y-4" : "bg-white text-stone-900 hover:scale-105 active:scale-95"}`}
            >
              <div className="w-24 h-24 rounded-full border-2 border-stone-100 flex items-center justify-center group-hover:border-stone-900 transition-all">
                <div className="w-20 h-20 rounded-full border border-stone-200" />
              </div>
            </button>
            
            <button 
              onClick={() => {}} // Additional action?
              className="w-16 h-16 rounded-full glass-dark text-white flex items-center justify-center opacity-40"
            >
              <Settings className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Minimized UI Controls */}
        {isMinimized && (
          <div className="absolute inset-0 bg-black/20 flex flex-col items-center justify-between p-4 group cursor-pointer" onClick={() => setIsMinimized(false)}>
            <div className="w-full flex justify-end">
               <button 
                 onClick={(e) => { e.stopPropagation(); onClose(); }}
                 className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
               >
                 <X className="w-4 h-4" />
               </button>
            </div>
            <div className="text-white text-center">
               <p className="text-[8px] font-bold uppercase tracking-widest bg-black/40 px-2 py-1 rounded">Tap to Expand</p>
            </div>
          </div>
        )}
      </motion.div>
    );
  };


  return (
    <div 
      className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-white font-sans selection:bg-stone-200 transition-colors duration-700 pb-24 relative"
    >
      {/* Immersive UI Toggle */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-[300] flex flex-col gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsUiVisible(!isUiVisible)}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl border ${
            isUiVisible 
              ? 'bg-white dark:bg-stone-900 border-stone-200 dark:border-white/10 text-stone-900 dark:text-white' 
              : 'bg-stone-900 text-white border-white/20 opacity-40 hover:opacity-100'
          }`}
          title={isUiVisible ? "Hide Interface" : "Show Interface"}
        >
          {isUiVisible ? <Zap className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </motion.button>
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-[200] px-6 py-8 transition-all duration-700 ${showNav && isUiVisible ? 'translate-y-0 opacity-100' : '-translate-y-32 opacity-0 pointer-events-none'} ${step === "weddings" ? "max-w-none px-0" : ""}`}>
        <div className={`max-w-[1600px] mx-auto flex items-center justify-between rounded-[2.5rem] px-8 py-4 transition-all duration-700 ${step === 'weddings' ? 'glass-dark border border-white/10 ring-1 ring-white/5 mx-6' : 'glass-morphism shadow-2xl shadow-stone-100 dark:shadow-black/50 ring-1 ring-white/40'}`}>
          <div className="flex items-center gap-4 cursor-pointer group" onClick={() => { setStep("welcome"); setCurrentWedding(null); }}>
             <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-700 ${step === 'weddings' ? 'bg-white text-stone-900' : 'bg-stone-900 dark:bg-white text-white dark:text-stone-900'}`}>
                <Heart className="w-6 h-6" />
             </div>
             <div className={`w-[1px] h-8 hidden md:block ${step === 'weddings' ? 'bg-white/10' : 'bg-stone-200 dark:bg-stone-800'}`} />
             <div className="hidden md:block">
                <p className={`text-[10px] font-bold uppercase tracking-[0.4em] ${step === 'weddings' ? 'text-white/40' : 'text-stone-400'}`}>Curated Memories</p>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDark(!isDark)}
              className={`p-3 rounded-xl transition-all hover:scale-110 active:scale-95 ${step === 'weddings' ? 'glass-dark text-white' : 'glass-morphism text-stone-900 dark:text-white'}`}
            >
              {isDark ? <Zap className="w-5 h-5 text-yellow-400" /> : <Zap className="w-5 h-5 text-stone-400" />}
            </button>
            {user && (
              <button 
                onClick={() => setShowCreateModal(true)}
                className="p-3 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-lg hover:scale-110 active:scale-95 transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            {step === "gallery" && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={toggleWatermark}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all ${
                    currentWedding?.watermarkEnabled ? 'bg-stone-900 text-white shadow-lg shadow-stone-200' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Watermark: {currentWedding?.watermarkEnabled ? 'ON' : 'OFF'}
                </button>
                {currentWedding?.ownerId === user?.uid && (
                  <button 
                    onClick={() => setShowWatermarkModal(true)}
                    className="p-2 rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all"
                  >
                    <Filter className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
            
            {user ? (
               <div className="flex items-center gap-3">
                 <div className="hidden md:block text-right">
                    <p 
                      onClick={() => setStep("profile")}
                      className="text-[10px] font-bold text-stone-900 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors"
                    >
                      {user.displayName?.split(" ")[0]}
                    </p>
                    <button onClick={handleLogout} className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors uppercase tracking-widest">Logout</button>
                 </div>
                 <div 
                   onClick={() => setStep("profile")}
                   className="w-9 h-9 rounded-full border border-stone-200 overflow-hidden bg-stone-50 cursor-pointer hover:border-indigo-600 transition-all"
                 >
                    <img src={user.photoURL || ""} className="w-full h-full object-cover" />
                 </div>
               </div>
            ) : (
              <button 
                onClick={signInWithGoogle}
                className="px-6 py-2.5 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 text-[10px] font-bold uppercase tracking-widest hover:bg-stone-800 transition-all active:scale-95 shadow-xl"
              >
                Log In
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className={`transition-all duration-700 ${showNav && isUiVisible ? 'pt-32 pb-24' : 'pt-0 pb-0'} ${step === "weddings" ? "max-w-none px-0 pt-0 pb-0" : "max-w-[100vw] px-6"} mx-auto`}>
        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="relative min-h-screen flex flex-col items-center justify-start text-center space-y-24 py-20 pb-40 overflow-x-hidden"
            >
              {/* Cinematic Background Elements */}
              <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-screen h-screen bg-gradient-to-b from-stone-100/50 to-transparent dark:from-stone-900/50" />
                <motion.div 
                  animate={{ 
                    scale: [1, 1.1, 1],
                    opacity: [0.1, 0.2, 0.1]
                  }}
                  transition={{ duration: 10, repeat: Infinity }}
                  className="absolute top-[-10%] left-[-10%] w-[60%] aspect-square bg-indigo-200 dark:bg-indigo-950/30 rounded-full blur-[120px]" 
                />
                <motion.div 
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.1, 0.15, 0.1]
                  }}
                  transition={{ duration: 8, repeat: Infinity, delay: 2 }}
                  className="absolute bottom-[20%] right-[-5%] w-[50%] aspect-square bg-stone-200 dark:bg-stone-900/40 rounded-full blur-[100px]" 
                />
              </div>

              {/* Hero Section */}
              <div className="space-y-12 max-w-6xl mx-auto px-6 relative z-10 pt-20">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-4 px-8 py-4 rounded-full glass-morphism border border-white/40 shadow-2xl text-stone-900 dark:text-white text-[10px] font-bold uppercase tracking-[0.5em]"
                >
                  <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                  E. Moments Protocol v3.0
                </motion.div>
                
                <div className="space-y-6">
                  <h1 className="text-[12vw] lg:text-[10rem] font-serif italic text-stone-900 dark:text-white leading-[0.85] tracking-tight">
                    Look <br />
                    <span className="text-stone-300 dark:text-stone-700/50">a little</span> more.
                  </h1>
                  <motion.div 
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 1.5, ease: "circOut" }}
                    className="h-[1px] w-40 bg-stone-900 dark:bg-white mx-auto opacity-20"
                  />
                </div>
                
                <p className="text-xl md:text-3xl text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl mx-auto font-serif italic">
                  "Beyond mere pixels, we curate the emotional atmosphere of your most sacred exchanges."
                </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
                <button 
                  onClick={() => user ? setStep("profile") : signInWithGoogle()}
                  className="group relative px-16 py-7 rounded-[2.5rem] bg-stone-900 dark:bg-white text-white dark:text-stone-900 font-bold text-[11px] uppercase tracking-[0.4em] shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_50px_rgba(255,255,255,0.1)] overflow-hidden hover:scale-105 active:scale-95 transition-all"
                >
                  <div className="absolute inset-0 bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="relative flex items-center gap-4 text-xs">
                    {user ? "Enter My Profile Protocol" : "Authenticate To Begin"}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>
                
                <button 
                  onClick={() => setShowJoinModal(true)}
                  className="px-10 py-7 rounded-[2.5rem] glass-morphism border border-stone-200 dark:border-white/10 text-stone-900 dark:text-white font-bold text-[11px] uppercase tracking-[0.4em] flex items-center gap-3 hover:translate-y-[-2px] transition-all"
                >
                  <div className="flex items-center gap-1">
                    <User className="w-4 h-4 text-indigo-500" />
                  </div>
                  Sync Protocol
                </button>

                <button 
                  onClick={() => {
                    setCameraInitialMode("qr");
                    setShowCamera(true);
                  }}
                  className="px-10 py-7 rounded-[2.5rem] bg-indigo-600 text-white font-bold text-[11px] uppercase tracking-[0.4em] flex items-center gap-3 hover:scale-105 transition-all shadow-xl shadow-indigo-500/20"
                >
                  <QrCode className="w-5 h-5" />
                  Scan QR
                </button>

                <button 
                  onClick={() => {
                        if (currentWedding) {
                          setStep("upload");
                        } else {
                          setStep("weddings");
                          showNotification("Select a sanctuary to transmit assets");
                        }
                      }}
                      className="px-10 py-7 rounded-[2.5rem] bg-stone-900 border border-stone-800 text-white font-bold text-[11px] uppercase tracking-[0.4em] flex items-center gap-3 hover:translate-y-[-2px] transition-all shadow-xl shadow-stone-900/20"
                    >
                      <Upload className="w-5 h-5 text-indigo-400" />
                      Transmit
                    </button>

                    <button 
                      onClick={() => setStep("weddings")}
                      className="px-10 py-7 rounded-[2.5rem] bg-indigo-600/10 border border-indigo-200/50 text-indigo-600 font-bold text-[11px] uppercase tracking-[0.4em] flex items-center gap-3 hover:translate-y-[-2px] transition-all"
                    >
                      <LayoutGrid className="w-5 h-5" />
                      Explore Protocols
                    </button>
                    
                    <button 
                      onClick={() => setStep("weddings")}
                      className="flex flex-col items-start gap-1 p-6 border-l border-stone-200 dark:border-white/10 hover:bg-stone-50 dark:hover:bg-white/5 transition-all text-left group"
                    >
                      <span className="text-[10px] font-bold text-stone-900 dark:text-white uppercase tracking-widest group-hover:text-indigo-500 transition-colors">Active Registries</span>
                      <p className="text-4xl font-serif italic text-stone-300 dark:text-stone-700 group-hover:text-stone-800 dark:group-hover:text-stone-200 transition-colors">{weddings.length}+</p>
                    </button>
                  </div>
              </div>

              {/* Featured Marquee Section */}
              <div className="w-full py-10 space-y-10">
                <div className="flex items-center gap-6 px-10">
                  <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-stone-200 dark:to-white/10" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-stone-400 whitespace-nowrap">Atmospheric Extractions</p>
                  <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-stone-200 dark:to-white/10" />
                </div>

                <div className="relative overflow-hidden group">
                  <motion.div 
                    animate={{ x: [0, -2000] }}
                    transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
                    className="flex gap-10 whitespace-nowrap w-max px-6"
                  >
                    {[...Array(12)].map((_, i) => (
                      <div key={i} className="w-[30vw] md:w-[22vw] aspect-[4/5] rounded-[3rem] overflow-hidden bg-stone-200 dark:bg-white/5 border border-white/10 shadow-2xl relative group/card">
                        <img 
                          src={`https://images.unsplash.com/photo-${1519741497674 + i*200}?auto=format&fit=crop&q=80&w=800`} 
                          className="w-full h-full object-cover grayscale group-hover/card:grayscale-0 transition-all duration-1000 scale-110 group-hover/card:scale-100" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-stone-900/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity p-8 flex flex-col justify-end">
                          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/60 mb-2">Protocol Captured</p>
                          <h4 className="text-xl font-serif italic text-white line-clamp-1">Moment Ref: {1000 + i}</h4>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                </div>
              </div>

              {/* Philosophy Section */}
              <div className="max-w-7xl mx-auto px-10 grid grid-cols-1 md:grid-cols-3 gap-10 pt-20">
                <div className="p-12 rounded-[3.5rem] glass-morphism border border-white/40 space-y-6 text-left group">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform">
                    <Zap className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold uppercase tracking-widest text-stone-900 dark:text-white">Instant <br />Recall</h3>
                  <p className="text-sm text-stone-500 dark:text-stone-400 font-medium leading-relaxed italic">"Access thousand of memories in sub-second latency via our aesthetic lookup protocols."</p>
                </div>

                <div className="p-12 rounded-[3.5rem] bg-stone-900 dark:bg-white text-white dark:text-stone-900 space-y-6 text-left group shadow-2xl">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 dark:bg-stone-900/10 flex items-center justify-center text-white dark:text-stone-900 group-hover:rotate-12 transition-transform">
                    <Heart className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold uppercase tracking-widest">Aesthetic <br />Purity</h3>
                  <p className="text-sm opacity-60 font-medium leading-relaxed italic">"Every pixel is treated as a piece of history. We maintain the sacred geometry of your day."</p>
                </div>

                <div className="p-12 rounded-[3.5rem] glass-morphism border border-white/40 space-y-6 text-left group">
                  <div className="w-14 h-14 rounded-2xl bg-stone-100 dark:bg-white/10 flex items-center justify-center text-stone-400 group-hover:translate-y-[-5px] transition-transform">
                    <Globe className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold uppercase tracking-widest">Global <br />Sync</h3>
                  <p className="text-sm text-stone-500 dark:text-stone-400 font-medium leading-relaxed italic">"A decentralized sanctuary accessible from any point in the terrestrial sphere."</p>
                </div>
              </div>

              {/* Scroll Indicator */}
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 opacity-20 pointer-events-none hidden md:flex">
                <p className="text-[8px] font-bold uppercase tracking-[0.6em] text-stone-500">Immerse</p>
                <div className="w-[1px] h-20 bg-stone-300 relative overflow-hidden">
                  <motion.div 
                    animate={{ y: [0, 80] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute top-0 left-0 w-full h-[30%] bg-stone-900 dark:bg-white"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Profile Sanctuary */}
          {step === "profile" && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-4xl mx-auto py-20 px-6 space-y-12"
            >
              <div className="flex flex-col items-center text-center space-y-8">
                <div className="relative group">
                  <div className="w-40 h-40 rounded-full ring-4 ring-stone-900/5 dark:ring-white/10 p-1.5 transition-transform duration-700 group-hover:scale-105">
                    <img src={user?.photoURL || ""} className="w-full h-full rounded-full object-cover shadow-2xl" />
                  </div>
                  <button 
                    onClick={() => profilePicRef.current?.click()}
                    className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-stone-900 text-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                  <input 
                    type="file" 
                    ref={profilePicRef}
                    onChange={handleProfilePicUpdate}
                    className="hidden"
                    accept="image/*"
                  />
                  {isUpdatingProfile && (
                    <div className="absolute inset-0 rounded-full bg-white/40 dark:bg-black/40 backdrop-blur-sm flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  )}
                </div>

                <div className="space-y-4 w-full max-w-lg">
                  <div className="space-y-2">
                    <h2 className="text-6xl font-serif italic text-stone-900 dark:text-white tracking-tighter leading-none">{user?.displayName}</h2>
                    <div className="flex items-center justify-center gap-3">
                      {profileTitle && (
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.5em]">{profileTitle}</p>
                      )}
                      <div className="flex items-center justify-center gap-6 py-2">
                        <div 
                          onClick={() => { setNetworkView("followers"); document.getElementById('curator-network')?.scrollIntoView({ behavior: 'smooth' }); }}
                          className="text-center group/stat cursor-pointer hover:scale-105 transition-transform"
                        >
                          <p className="text-xl font-serif italic text-stone-900 dark:text-white group-hover/stat:text-indigo-500 transition-colors">1.2k</p>
                          <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">Followers</p>
                        </div>
                        <div className="w-[1px] h-6 bg-stone-200 dark:bg-white/10" />
                        <div 
                          onClick={() => { setNetworkView("following"); document.getElementById('curator-network')?.scrollIntoView({ behavior: 'smooth' }); }}
                          className="text-center group/stat cursor-pointer hover:scale-105 transition-transform"
                        >
                          <p className="text-xl font-serif italic text-stone-900 dark:text-white group-hover/stat:text-indigo-500 transition-colors">482</p>
                          <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">Following</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-4">
                        <button className="px-8 py-4 rounded-2xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 hover:translate-y-[-2px] transition-all flex items-center gap-3 group">
                           <UserPlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                           Follow
                        </button>
                        <button 
                          onClick={() => setShowProfileSettings(!showProfileSettings)}
                          className="w-12 h-12 rounded-2xl glass-morphism text-stone-400 hover:text-stone-900 dark:hover:text-white flex items-center justify-center hover:bg-stone-100 dark:hover:bg-white/10 transition-all border border-stone-200 dark:border-white/10"
                        >
                          <Settings2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {showProfileSettings && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-[2.5rem] p-8 space-y-6 text-left overflow-hidden mt-6"
                      >
                        <div className="flex items-center justify-between mb-2">
                           <h3 className="text-[10px] font-bold uppercase tracking-[0.4em] text-stone-900 dark:text-white">Editor Protocol</h3>
                           <button 
                             onClick={() => setIsPreviewMode(!isPreviewMode)}
                             className="px-4 py-2 rounded-full glass-morphism text-[8px] font-bold uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-2"
                           >
                             {isPreviewMode ? <div className="flex items-center gap-2 text-indigo-500"><Sparkles className="w-3 h-3" /> Live View</div> : "Show After-Look"}
                           </button>
                        </div>

                        {isPreviewMode ? (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="space-y-8 pt-4 pb-4"
                          >
                            <div className="space-y-8 p-10 rounded-[2.5rem] bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/10 text-left shadow-2xl relative overflow-hidden backdrop-blur-xl">
                               <div className="absolute -top-6 -right-6 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl" />
                               <div className="space-y-2 relative z-10">
                                 <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-indigo-400">Curator Statement</p>
                                 <p className="text-lg font-serif italic leading-relaxed text-stone-800 dark:text-stone-200">
                                   {profileAbout ? `"${profileAbout}"` : "The silence of a moment captured is a language only the heart understands."}
                                 </p>
                               </div>
                               <div className="space-y-2 relative z-10">
                                 <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-indigo-400">Preferred Medium</p>
                                 <div className="inline-flex px-5 py-2 rounded-full bg-indigo-500 text-white text-[10px] font-mono font-bold uppercase tracking-widest shadow-lg shadow-indigo-500/20">
                                   {profileFavoriteSubject || "Ethereal Landscapes"}
                                 </div>
                               </div>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                               <div className="h-[1px] w-12 bg-stone-200 dark:bg-white/10" />
                               <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Masterpiece Protocol Preview</p>
                            </div>
                          </motion.div>
                        ) : (
                          <div className="space-y-4">
                             <div className="space-y-1.5">
                                <label className="text-[9px] font-bold uppercase tracking-[0.3em] text-stone-400 ml-2">Display Name</label>
                                <div className="px-6 py-4 bg-white dark:bg-stone-900 rounded-2xl text-sm font-medium border border-stone-200 dark:border-white/5 opacity-50 cursor-not-allowed">
                                  {user?.displayName}
                                </div>
                                <p className="text-[8px] text-stone-400 ml-2">Linked to your Google Identity</p>
                             </div>

                             <div className="space-y-1.5">
                                <label className="text-[9px] font-bold uppercase tracking-[0.3em] text-stone-400 ml-2">Email Identity</label>
                                <div className="px-6 py-4 bg-white dark:bg-stone-900 rounded-2xl text-sm font-medium border border-stone-200 dark:border-white/5 opacity-50 cursor-not-allowed">
                                  {user?.email}
                                </div>
                             </div>

                             <div className="space-y-1.5">
                                <label className="text-[9px] font-bold uppercase tracking-[0.3em] text-stone-400 ml-2">Legacy Title (Description)</label>
                                <input 
                                  value={profileTitle}
                                  onChange={(e) => setProfileTitle(e.target.value)}
                                  placeholder="Elite Curator, Master of Moments..."
                                  className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 rounded-2xl px-6 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-inner"
                                />
                             </div>

                             <div className="space-y-1.5">
                                <label className="text-[9px] font-bold uppercase tracking-[0.3em] text-stone-400 ml-2">About Me</label>
                                <textarea 
                                  value={profileAbout}
                                  onChange={(e) => setProfileAbout(e.target.value)}
                                  placeholder="Tell us about your photographic journey..."
                                  className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 rounded-2xl px-6 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-inner min-h-[100px] resize-none"
                                />
                             </div>

                             <div className="space-y-1.5">
                                <label className="text-[9px] font-bold uppercase tracking-[0.3em] text-stone-400 ml-2">Favorite Subject</label>
                                <input 
                                  value={profileFavoriteSubject}
                                  onChange={(e) => setProfileFavoriteSubject(e.target.value)}
                                  placeholder="Portraits, Landscapes, Candids..."
                                  className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 rounded-2xl px-6 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-inner"
                                />
                             </div>
                          </div>
                        )}

                        <div className="flex gap-3">
                           <button 
                             onClick={() => setShowProfileSettings(false)}
                             className="flex-1 py-4 rounded-2xl glass-morphism text-[10px] font-bold uppercase tracking-widest hover:bg-stone-200 dark:hover:bg-white/10 transition-all"
                           >
                             Cancel
                           </button>
                           <button 
                             onClick={handleUpdateProfile}
                             disabled={isUpdatingProfile}
                             className="flex-1 py-4 rounded-2xl bg-stone-900 text-white text-[10px] font-bold uppercase tracking-widest hover:translate-y-[-2px] transition-all disabled:opacity-50 shadow-xl"
                           >
                             {isUpdatingProfile ? "Synchronizing..." : "Store Protocol"}
                           </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!showProfileSettings && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-6 pt-4"
                    >
                      {(profileAbout || profileFavoriteSubject) && (
                        <div className="space-y-6 p-8 rounded-[2.5rem] bg-indigo-50/30 dark:bg-indigo-500/5 border border-indigo-100/50 dark:border-indigo-500/10 text-left max-w-md mx-auto">
                           {profileAbout && (
                             <div className="space-y-1">
                               <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-indigo-400">Curator Statement</p>
                               <p className="text-sm font-medium leading-relaxed italic opacity-70">"{profileAbout}"</p>
                             </div>
                           )}
                           {profileFavoriteSubject && (
                             <div className="space-y-1">
                               <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-indigo-400">Preferred Medium</p>
                               <p className="text-xs font-bold uppercase tracking-widest">{profileFavoriteSubject}</p>
                             </div>
                           )}
                        </div>
                      )}

                      <div className="flex flex-wrap justify-center gap-3 pt-4">
                        <div className="px-5 py-2.5 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 text-[10px] font-bold uppercase tracking-widest shadow-xl">Elite Curator</div>
                        <div className="px-5 py-2.5 rounded-full glass-morphism text-stone-900 dark:text-white text-[10px] font-bold uppercase tracking-widest">Protocol Level 4</div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-12">
                {/* Managed Sanctuaries */}
                {user && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-12 glass-morphism rounded-[3.5rem] space-y-8"
                  >
                    <div className="flex items-center justify-between">
                       <div className="space-y-1">
                          <h3 className="text-2xl font-bold uppercase tracking-widest">Managed Sanctuaries</h3>
                          <p className="text-[10px] text-stone-400 uppercase tracking-widest text-indigo-500">Your Created Registries</p>
                       </div>
                       <button 
                         onClick={() => setShowCreateModal(true)}
                         className="px-6 py-3 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2"
                       >
                         <Plus className="w-4 h-4" /> New Protocol
                       </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                       {weddings.filter(w => w.ownerId === user.uid).map((wedding) => (
                         <div 
                           key={wedding.id}
                           className="group relative overflow-hidden rounded-3xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-white/5 hover:border-indigo-500/50 transition-all p-6 space-y-4"
                         >
                            <div className="space-y-1">
                               <h4 className="font-serif italic text-xl text-stone-900 dark:text-white">{wedding.name}</h4>
                               <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">{wedding.date}</p>
                            </div>
                            <div className="flex items-center gap-2">
                               <button 
                                 onClick={() => { setCurrentWedding(wedding); setStep("gallery"); }}
                                 className="flex-1 py-3 rounded-xl bg-indigo-500 text-white text-[9px] font-bold uppercase tracking-widest"
                               >
                                 Open
                               </button>
                               <button 
                                 onClick={() => { setEditingWedding(wedding); setShowEditModal(true); }}
                                 className="p-3 rounded-xl bg-stone-100 dark:bg-white/10 text-stone-400 hover:text-stone-900 dark:hover:text-white transition-all"
                               >
                                 <Settings className="w-4 h-4" />
                               </button>
                            </div>
                         </div>
                       ))}
                       {weddings.filter(w => w.ownerId === user.uid).length === 0 && (
                         <div className="col-span-full py-20 text-center border-2 border-dashed border-stone-100 rounded-[2.5rem] flex flex-col items-center gap-4">
                            <Heart className="w-10 h-10 text-stone-100" />
                            <p className="text-[10px] uppercase font-bold tracking-[0.3em] text-stone-400">No managed protocols detect</p>
                            <button 
                              onClick={() => setShowCreateModal(true)}
                              className="text-indigo-500 text-[10px] font-bold uppercase tracking-widest border-b border-indigo-500/20 pb-1"
                            >
                              Initialize Your First Sanctuary
                            </button>
                         </div>
                       )}
                    </div>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-12 glass-morphism rounded-[3.5rem] space-y-8"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold uppercase tracking-widest">Saved Objects</h3>
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest">Aesthetic Collections</p>
                      </div>
                      <span className="text-4xl font-serif italic opacity-20">{savedPhotos.length}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {savedPhotos.slice(0, 9).map((photo, i) => (
                        <div 
                          key={i} 
                          onClick={() => setSelectedPhoto(photo)}
                          className="aspect-square rounded-3xl overflow-hidden bg-stone-50 border border-stone-200 cursor-pointer hover:scale-105 transition-transform group relative"
                        >
                          <img src={photo.url} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-indigo-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <Maximize2 className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      ))}
                      {savedPhotos.length === 0 && (
                        <div className="col-span-3 py-16 text-center border-2 border-dashed border-stone-200 rounded-[2.5rem] flex flex-col items-center gap-4">
                          <ImageIcon className="w-8 h-8 text-stone-200" />
                          <p className="text-[10px] uppercase font-bold tracking-[0.3em] text-stone-400">Vault spectrum empty</p>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => {
                        if (savedPhotos.length > 0) {
                          setStep("gallery");
                          setShowSelectionsOnly(true);
                          // If no specific wedding context, we treat savedPhotos as the primary collection
                          if (!currentWedding) {
                            setUploadedPhotos(savedPhotos);
                            setMatchedIndices(savedPhotos.map((_, i) => i));
                          }
                        } else {
                          showNotification("Select objects from a sanctuary to populate the vault");
                        }
                      }}
                      className="w-full py-5 rounded-[2rem] bg-stone-900 text-white text-[10px] font-bold uppercase tracking-[0.3em] shadow-2xl hover:translate-y-[-4px] transition-all flex items-center justify-center gap-4"
                    >
                      <LayoutGrid className="w-4 h-4" />
                      Enter Private Viewport
                    </button>
                  </motion.div>

                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-12 glass-dark rounded-[3.5rem] space-y-10 text-white"
                  >
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold uppercase tracking-widest text-indigo-400">Security Protocols</h3>
                      <p className="text-sm opacity-50 font-medium">Manage your cryptographic identity and sanctuary access.</p>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-4 hover:border-white/20 transition-all group">
                         <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Biometric Key</p>
                            <div className="w-12 h-6 rounded-full bg-green-500/20 p-1 flex items-center justify-end">
                               <div className="w-4 h-4 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]" />
                            </div>
                         </div>
                         <p className="text-xs opacity-40">Your unique biometric signature is used for all high-fidelity archival extractions.</p>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <button 
                          onClick={handleLogout}
                          className="w-full py-5 rounded-[2rem] bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-red-500/20 transition-all flex items-center justify-center gap-3"
                        >
                          <LogOut className="w-4 h-4" /> Terminate Session
                        </button>
                        <button 
                          onClick={() => setStep("welcome")}
                          className="w-full py-5 rounded-[2rem] bg-white/5 text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] hover:text-white transition-all flex items-center justify-center gap-3"
                        >
                          <ArrowLeft className="w-4 h-4" /> Return to Atrium
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Curator Network */}
                <motion.div 
                  id="curator-network"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-12 glass-morphism rounded-[3.5rem] space-y-10"
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-2xl font-bold uppercase tracking-widest text-stone-900 dark:text-white">Curator Network</h3>
                      <p className="text-[10px] text-indigo-500 uppercase tracking-widest font-bold">
                        {networkView === "followers" ? "Synchronized Entities" : "Protocols Followed"}
                      </p>
                    </div>
                    <div className="flex bg-stone-100 dark:bg-white/5 p-1 rounded-2xl border border-stone-200 dark:border-white/10">
                       <button 
                         onClick={() => setNetworkView("followers")}
                         className={`px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${networkView === "followers" ? "bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm" : "text-stone-400 hover:text-stone-900 dark:hover:text-white"}`}
                       >
                         Followers
                       </button>
                       <button 
                         onClick={() => setNetworkView("following")}
                         className={`px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${networkView === "following" ? "bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm" : "text-stone-400 hover:text-stone-900 dark:hover:text-white"}`}
                       >
                         Following
                       </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(networkView === "followers" ? [
                      { name: "Julian Thorne", role: "Light Sculptor", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop" },
                      { name: "Elena Rossi", role: "Ethereal Curator", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop" },
                      { name: "Marcus Vane", role: "Protocol Master", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop" },
                      { name: "Sasha Grey", role: "Moment Weaver", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop" }
                    ] : [
                      { name: "Aria Volt", role: "Prism Architect", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop" },
                      { name: "Kai Chen", role: "Shadow Engineer", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop" }
                    ]).map((curator, i) => (
                      <div key={i} className="group p-5 rounded-3xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-white/5 hover:border-indigo-500/30 transition-all flex items-center gap-4 cursor-pointer">
                        <div className="w-12 h-12 rounded-full overflow-hidden border border-stone-200 dark:border-white/10 group-hover:scale-105 transition-transform shadow-lg">
                          <img src={curator.avatar} className="w-full h-full object-cover" />
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-bold text-stone-900 dark:text-white">{curator.name}</h4>
                          <p className="text-[9px] text-indigo-500 uppercase tracking-widest font-bold">{curator.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button className="w-full py-5 rounded-[2rem] border border-dashed border-stone-200 dark:border-white/10 text-stone-400 hover:text-stone-900 dark:hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-3">
                    <Users className="w-4 h-4" />
                    Expand Shared Network
                  </button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {step === "weddings" && (
            <motion.div
              key="weddings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[150] bg-stone-950 text-white flex flex-col items-center justify-start py-20 px-6 md:px-12 overflow-y-auto"
            >
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div 
                  className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full animate-pulse" 
                />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-stone-500/10 blur-[120px] rounded-full" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
              </div>

              <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10">
                <div className="space-y-8">
                  <div className="space-y-3">
                    <motion.div 
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="inline-flex items-center gap-2.5 px-3 py-1 rounded-full border border-white/10 glass-dark"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[8px] font-bold uppercase tracking-[0.4em]">Protocol Active</span>
                    </motion.div>
                    <h2 className="text-4xl md:text-5xl font-serif italic leading-[1.1] tracking-tighter">
                      Search <br/> <span className="text-white/20">Protocols</span>
                    </h2>
                  </div>

                    <div className="space-y-5 max-w-[280px]">
                    <div className="space-y-1">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">01. Integrity</h3>
                      <p className="text-white/40 text-[11px] leading-relaxed font-medium">Encrypted signatures for your sanctuary.</p>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">02. Temporal</h3>
                      <p className="text-white/40 text-[11px] leading-relaxed font-medium">Session-based ephemeral access codes.</p>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">03. High-Fi</h3>
                      <p className="text-white/40 text-[11px] leading-relaxed font-medium">Soft-blur protected archival viewing.</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => { setStep("welcome"); setActiveTab("home"); }}
                    className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.5em] text-white/40 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Close Vault
                  </button>
                </div>

                <div className="flex flex-col justify-center">
                   <motion.div 
                     initial={{ scale: 0.95, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: 0.1 }}
                     className="glass-dark rounded-[2rem] p-8 space-y-8 border border-white/10 shadow-[0_40px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/5"
                   >
                      <div className="flex items-center justify-between">
                         <div className="space-y-1">
                            <p className="text-[9px] font-bold text-white uppercase tracking-[0.5em]">Session Key</p>
                            <p className="text-[8px] text-white/40 italic">Sync Sanctuary...</p>
                         </div>
                          <div className="flex flex-col items-center gap-2">
                             <div className="w-14 h-14 bg-white p-2.5 rounded-xl flex items-center justify-center shadow-2xl">
                                <QRCode id="qr-protocol" value={user?.uid || "eternal-moments"} size={40} />
                             </div>
                             <p className="text-[7px] font-mono text-stone-200 opacity-60 uppercase">{user?.uid?.slice(0, 8)}</p>
                             <button 
                               onClick={() => downloadQRCode("qr-protocol", "protocol")}
                               className="text-[7px] font-bold text-indigo-400 uppercase tracking-widest hover:text-white transition-colors flex items-center gap-1"
                             >
                                <Download className="w-2 h-2" /> Download
                             </button>
                          </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                         <button 
                           onClick={() => setShowJoinModal(true)}
                           className="relative overflow-hidden py-4 rounded-xl bg-indigo-600 text-white font-bold text-[9px] uppercase tracking-[0.4em] flex flex-col items-center justify-center gap-2 hover:translate-y-[-2px] active:scale-95 transition-all shadow-xl shadow-indigo-600/20 group"
                         >
                            <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-white/40 animate-scan-slow" />
                            <div className="flex items-center gap-1 relative z-10">
                               <Camera className="w-4 h-4 text-white/50" />
                               <QrCode className="w-5 h-5" />
                            </div>
                            <span className="relative z-10">Scan Code</span>
                         </button>
                         <button 
                           onClick={() => {
                             if (!user) {
                               signInWithGoogle();
                             } else {
                               setShowCreateModal(true);
                             }
                           }}
                           className="relative overflow-hidden py-4 rounded-xl bg-white text-stone-900 font-bold text-[9px] uppercase tracking-[0.4em] flex flex-col items-center justify-center gap-2 hover:translate-y-[-2px] active:scale-95 transition-all shadow-xl group"
                         >
                            <Plus className="w-5 h-5 relative z-10" />
                            <span className="relative z-10">Create Sanctuary</span>
                         </button>
                      </div>
                         <div className="grid grid-cols-2 gap-3">
                            <button 
                              onClick={async () => {
                                await navigator.clipboard.writeText(user?.uid || "");
                                showNotification("Primary Access link copied");
                              }}
                              className="py-3 rounded-lg bg-white/5 border border-white/10 text-white font-bold text-[8px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all font-mono"
                            >
                               <Share2 className="w-3 h-3 opacity-40" />
                               Copy Key
                            </button>
                            <button 
                               onClick={() => showNotification("Access codes terminated")}
                               className="py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-[8px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all font-mono"
                             >
                                <Zap className="w-3 h-3 opacity-40" />
                                Kill Codes
                             </button>
                         </div>

                      <div className="pt-8 border-t border-white/5 space-y-6">
                         <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.4em] text-white">Active Sanctuaries</h3>
                            <span className="text-[10px] font-mono text-white/20">{weddings.length} detected</span>
                         </div>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {/* Profile Shortcut Card */}
                            {user && (
                              <div 
                                onClick={() => setStep("profile")}
                                className="group/profile relative overflow-hidden rounded-2xl bg-indigo-500/10 border border-indigo-500/30 hover:border-indigo-400 hover:bg-indigo-500/20 transition-all p-5 space-y-4 cursor-pointer"
                              >
                                <div className="flex items-center gap-4">
                                   <div className="w-12 h-12 rounded-full border-2 border-indigo-400/50 overflow-hidden shadow-lg shadow-indigo-500/20">
                                      <img src={user.photoURL || ""} className="w-full h-full object-cover" />
                                   </div>
                                   <div className="space-y-0.5">
                                      <h4 className="font-serif italic text-lg text-white group-hover/profile:text-indigo-300 transition-colors">My Profile</h4>
                                      <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest">Protocol Identity</p>
                                   </div>
                                </div>
                                <div className="flex items-center justify-between pt-2">
                                   <p className="text-[9px] text-white/40 italic">Manage your curatorial statement and saved objects.</p>
                                   <ArrowRight className="w-4 h-4 text-indigo-400 group-hover/profile:translate-x-1 transition-transform" />
                                </div>
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/profile:opacity-30 transition-opacity">
                                   <User className="w-10 h-10 text-white" />
                                </div>
                              </div>
                            )}

                            {weddings.map((wedding) => (
                              <div 
                                key={wedding.id} 
                                className="group/item relative overflow-hidden rounded-2xl bg-white/5 border border-white/5 hover:border-indigo-500/50 hover:bg-white/10 transition-all p-5 space-y-4"
                              >
                                <div className="space-y-1">
                                  <h4 className="font-serif italic text-lg text-white group-hover/item:text-indigo-400 transition-colors">{wedding.name}</h4>
                                  <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">{wedding.date}</p>
                                </div>
                                <div className="flex items-center justify-between pt-2">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => { setCurrentWedding(wedding); setStep("gallery"); }}
                                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[8px] font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
                                    >
                                      Initialize View
                                    </button>
                                    <button
                                      onClick={() => { setCurrentWedding(wedding); setStep("upload"); }}
                                      className="p-2 rounded-lg bg-white/10 text-white/40 hover:text-white hover:bg-white/20 transition-all"
                                      title="Upload Memories"
                                    >
                                      <Upload className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {wedding.ownerId === user?.uid && (
                                    <button 
                                      onClick={() => { setEditingWedding(wedding); setShowEditModal(true); }}
                                      className="p-2 rounded-lg bg-white/10 text-white/40 hover:text-white hover:bg-white/20 transition-all"
                                    >
                                      <Settings className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover/item:opacity-20 transition-opacity">
                                   <Heart className="w-12 h-12 text-white" />
                                </div>
                              </div>
                            ))}
                            {weddings.length === 0 && (
                              <div className="col-span-full py-10 text-center space-y-4">
                                <Search className="w-10 h-10 text-white/10 mx-auto" />
                                <p className="text-[9px] text-white/20 italic tracking-[0.4em] uppercase font-bold">No Active Registries Found</p>
                              </div>
                            )}
                         </div>
                      </div>
                   </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "upload" && currentWedding && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="max-w-5xl mx-auto"
            >
              <div className="bg-white rounded-[3rem] p-16 text-center border border-stone-200 shadow-2xl shadow-stone-200/30 space-y-12">
                <div className="flex flex-col items-center gap-6">
                  <button 
                    onClick={() => setStep("weddings")}
                    className="absolute top-12 left-12 p-3 rounded-full hover:bg-stone-50 transition-colors text-stone-400"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 bg-stone-50 rounded-3xl flex items-center justify-center ring-1 ring-stone-100 shadow-inner">
                      <Upload className="w-10 h-10 text-stone-400" />
                    </div>
                    <button 
                      onClick={() => {
                        setCameraInitialMode("photo");
                        setShowCamera(true);
                      }}
                      className="w-20 h-20 bg-stone-900 text-white rounded-3xl flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all group"
                      title="Turn on Camera"
                    >
                      <Camera className="w-10 h-10 group-hover:rotate-12 transition-transform" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-4xl font-serif italic text-stone-900 tracking-tight">{currentWedding.name}</h2>
                    <p className="text-stone-400 font-medium uppercase tracking-[0.2em] text-[10px]">Photo Collection Room</p>
                  </div>
                </div>
                
                <div 
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={`border-4 border-dashed border-stone-100 rounded-[2.5rem] p-20 cursor-pointer transition-all duration-500 group ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-stone-300 hover:bg-stone-50'}`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFolderUpload}
                    multiple
                    {...({ webkitdirectory: "", directory: "" } as any)}
                    className="hidden" 
                  />
                  <div className="flex flex-col items-center gap-6">
                    {isUploading ? (
                      <div className="space-y-6 w-full max-w-xs mx-auto">
                        <div className="relative h-24 flex items-center justify-center">
                          <Loader2 className="w-16 h-16 text-indigo-500 animate-spin absolute" />
                          <div className="text-stone-900 font-bold text-sm z-10">{uploadProgress}%</div>
                        </div>
                        <div className="space-y-2">
                           <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${uploadProgress}%` }}
                                className="h-full bg-indigo-600"
                              />
                           </div>
                           <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-stone-400">
                              <span>Transmission Speed</span>
                              <span className="text-indigo-600 font-mono">{uploadSpeed || "0 KB/s"}</span>
                           </div>
                        </div>
                        <p className="text-lg font-serif italic text-stone-600">Securely transferring moments...</p>
                      </div>
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-full bg-stone-900 text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-xl">
                          <Plus className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xl font-medium text-stone-900">Select Wedding Collection</p>
                          <p className="text-stone-400 text-sm">Select files or a folder to upload</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {uploadedPhotos.length > 0 && !isUploading && (
                  <div className="space-y-6 pt-4">
                    <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                      {uploadedPhotos.slice(0, 5).map((p, i) => (
                        <div key={i} className="w-12 h-12 rounded-lg bg-stone-100 overflow-hidden">
                          <img src={p.url} className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {uploadedPhotos.length > 5 && (
                        <div className="w-12 h-12 rounded-lg bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-400">
                          +{uploadedPhotos.length - 5}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center">
                      <button 
                        onClick={() => setStep("verify")}
                        className="px-12 py-5 rounded-2xl bg-stone-900 text-white font-bold text-[10px] uppercase tracking-[0.2em] flex items-center gap-4 hover:translate-y-[-2px] active:scale-95 transition-all shadow-2xl shadow-stone-400"
                      >
                        Process & Find Me
                        <ArrowRight className="w-4 h-4 opacity-50" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === "verify" && (
            <motion.div
              key="verify"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white rounded-[3rem] overflow-hidden border border-stone-200 shadow-2xl shadow-stone-200/40">
                <div className="p-12 bg-stone-900 text-white text-center space-y-4">
                   <h2 className="text-4xl font-serif italic">Face Verification</h2>
                   <p className="text-stone-400 text-[10px] font-bold uppercase tracking-[0.2em]">Secure Scanning Technology</p>
                </div>
                
                 <div className="p-16 space-y-12 text-center bg-stone-50/20">
                   <div className="relative w-64 h-64 mx-auto">
                      <div className="w-full h-full rounded-[2.5rem] border-8 border-white shadow-2xl flex items-center justify-center overflow-hidden bg-stone-100 ring-1 ring-stone-200 group">
                        {selfie ? (
                          <img src={selfie} className="w-full h-full object-cover grayscale-[0.2]" />
                        ) : (
                          <div className="flex flex-col items-center gap-3">
                            <User className="w-20 h-20 text-stone-200" />
                            <Smile className="w-10 h-10 text-stone-200 animate-bounce" />
                          </div>
                        )}
                        {isVerifying && (
                          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-md flex flex-col items-center justify-center gap-4">
                            <Loader2 className="w-12 h-12 text-white animate-spin" />
                            <span className="text-[10px] text-white font-bold uppercase tracking-[0.3em]">Analyzing...</span>
                          </div>
                        )}
                      </div>
                      {!isVerifying && (
                        <div className="absolute -bottom-6 -right-6 flex flex-col gap-3">
                          <button 
                            onClick={() => {
                              setCameraInitialMode("photo");
                              setShowCamera(true);
                            }}
                            className="w-16 h-16 rounded-[1.5rem] bg-stone-900 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all ring-4 ring-white"
                          >
                            <Camera className="w-7 h-7" />
                          </button>
                          <button 
                            onClick={() => selfieInputRef.current?.click()}
                            className="w-12 h-12 rounded-[1rem] bg-stone-100 text-stone-600 flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all ring-2 ring-white"
                          >
                            <ImageIcon className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                      <input 
                        type="file" 
                        ref={selfieInputRef}
                        onChange={handleSelfieUpload}
                        className="hidden" 
                        accept="image/*"
                      />
                   </div>

                   <p className="text-stone-400 text-[10px] uppercase tracking-[0.3em] font-bold max-w-xs mx-auto leading-loose">
                     {isVerifying ? "Comparing biometric data with the registry collection..." : "Capture a real-time portrait or select one from your library to initialize the discovery engine."}
                   </p>

                   {!isVerifying && (
                     <div className="pt-8">
                       <button 
                         onClick={() => {
                           setMatchedIndices(uploadedPhotos.map((_, i) => i));
                           setStep("gallery");
                           showNotification("Accessing full registry collection");
                         }}
                         className="text-[10px] font-bold uppercase tracking-[0.4em] text-stone-400 hover:text-stone-900 transition-colors"
                       >
                         Skip Verification & View All
                       </button>
                     </div>
                   )}
                </div>
              </div>
              
              <AnimatePresence>
                {showCamera && (
                  <CameraCapture 
                    accessKeyId={currentWedding?.id || user?.uid}
                    initialMode={cameraInitialMode}
                    onCapture={(url) => {
                      setShowCamera(false);
                      handleVerifyFace(url);
                    }}
                    onScan={handleQRScanJoin}
                    onClose={() => setShowCamera(false)}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Scoped Global Overlay for Camera */}
          <AnimatePresence>
            {showCamera && (
              <CameraCapture 
                accessKeyId={currentWedding?.id || joinId || user?.uid}
                initialMode={cameraInitialMode}
                onCapture={(url) => {
                  setShowCamera(false);
                  if (step === "verify") {
                    handleVerifyFace(url);
                  } else if (step === "upload") {
                    handleCameraCapture(url);
                  } else if (step === "profile") {
                     // Handled by profile click handler but keep as fallback
                  } else {
                     showNotification("Capture process recorded and analyzed");
                  }
                }}
                onScan={handleQRScanJoin}
                onClose={() => setShowCamera(false)}
              />
            )}
          </AnimatePresence>

          {step === "gallery" && (currentWedding || (showSelectionsOnly && savedPhotos.length > 0)) && (
            <motion.div
              key="gallery"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-16"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-16">
                <div className="space-y-6">
                  <span className="text-stone-400 font-mono text-xs uppercase tracking-[0.5em] block">{currentWedding ? "Found Collection" : "Global Sanctuary"}</span>
                  <h2 className="text-8xl font-serif italic text-stone-900 dark:text-white leading-tight tracking-tighter">{currentWedding ? "Vault Search" : "Archived Selections"}</h2>
                  <div className="flex items-center gap-6">
                     <p className="text-stone-500 font-medium text-lg whitespace-nowrap">{currentWedding ? "Access your high-end **memories via protocol**." : "Your curated collection of session masterpieces."}</p>
                     <div className="h-[2px] w-20 bg-stone-200 dark:bg-white/10" />
                     
                     <div className="flex bg-stone-100 dark:bg-white/5 p-1 rounded-2xl border border-stone-200/50 dark:border-white/10">
                       <button 
                         disabled={!currentWedding}
                         onClick={() => setShowSelectionsOnly(false)}
                         className={`px-6 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all ${!showSelectionsOnly ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-400 disabled:opacity-30'}`}
                       >
                         All Captures
                       </button>
                       <button 
                         onClick={() => setShowSelectionsOnly(true)}
                         className={`px-6 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all relative flex items-center gap-2 ${showSelectionsOnly ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-400'}`}
                       >
                         My Selection
                         {savedPhotos.length > 0 && (
                           <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[7px] flex items-center justify-center animate-pulse">
                             {savedPhotos.length}
                           </span>
                         )}
                       </button>
                     </div>
                  </div>

                  {/* AI Summarization Section */}
                  {currentWedding && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pt-12 space-y-8"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                             <h3 className="text-[10px] font-bold uppercase tracking-[0.4em] text-indigo-400">Curator's Analysis</h3>
                             <div className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-[8px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Experimental AI</div>
                          </div>
                          <p className="text-[11px] text-stone-400 italic font-medium leading-relaxed max-w-sm">Synthesize the aesthetic essence and emotional core of this collection via Gemini.</p>
                        </div>
                        <button 
                          onClick={handleSummarizeCollection}
                          disabled={isSummarizing || uploadedPhotos.length === 0}
                          className={`px-8 py-4 rounded-2xl bg-stone-900 dark:bg-white text-white dark:text-stone-900 text-[10px] font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-3 w-full sm:w-auto ${isSummarizing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isSummarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                          {isSummarizing ? 'Synthesizing...' : 'Generate AI Summary'}
                        </button>
                      </div>

                      {collectionSummary && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="p-10 rounded-[3rem] bg-indigo-50/30 dark:bg-indigo-500/5 border border-indigo-100/50 dark:border-indigo-500/10 shadow-inner relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-4 opacity-10">
                             <Zap className="w-20 h-20 text-indigo-500" />
                          </div>
                          <p className="text-xl md:text-2xl text-stone-800 dark:text-stone-200 font-serif italic leading-relaxed relative z-10">
                            "{collectionSummary}"
                          </p>
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {/* AI Toast Assistant Section */}
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pt-12 space-y-8 border-t border-stone-100 dark:border-white/5 mt-12"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                           <h3 className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber-500">Toast Master AI</h3>
                           <div className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-[8px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Guest Companion</div>
                        </div>
                        <p className="text-[11px] text-stone-400 italic font-medium leading-relaxed max-w-sm">Need words for the big moment? Let Gemini compose a timeless toast for you.</p>
                      </div>
                      <button 
                        onClick={() => setShowToastAssistant(!showToastAssistant)}
                        className={`px-8 py-4 rounded-2xl ${showToastAssistant ? 'bg-stone-100 dark:bg-white/10 text-stone-600 dark:text-white' : 'bg-amber-500 text-white'} text-[10px] font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-3 w-full sm:w-auto`}
                      >
                        <Wand2 className="w-4 h-4" />
                        {showToastAssistant ? 'Hide Assistant' : 'Open Toast Assistant'}
                      </button>
                    </div>

                    <AnimatePresence>
                      {showToastAssistant && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-8 md:p-12 rounded-[3.5rem] bg-stone-100/50 dark:bg-white/5 border border-stone-200 dark:border-white/10 space-y-10">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                               <div className="space-y-6">
                                  <div className="space-y-3">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.3em] text-stone-400 ml-2">My Relationship</label>
                                    <div className="flex flex-wrap gap-2">
                                      {["Friend", "Sibling", "Parent", "Maid of Honor", "Best Man", "Groom", "Bride"].map(r => (
                                        <button 
                                          key={r}
                                          onClick={() => setToastRelationship(r)}
                                          className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${toastRelationship === r ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-lg' : 'bg-white dark:bg-stone-900 text-stone-400 border border-stone-200 dark:border-white/10'}`}
                                        >
                                          {r}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.3em] text-stone-400 ml-2">Desired Tone</label>
                                    <div className="flex flex-wrap gap-2">
                                      {["Humorous", "Emotional", "Formal", "Short & Sweet"].map(t => (
                                        <button 
                                          key={t}
                                          onClick={() => setToastTone(t)}
                                          className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${toastTone === t ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-lg' : 'bg-white dark:bg-stone-900 text-stone-400 border border-stone-200 dark:border-white/10'}`}
                                        >
                                          {t}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                               </div>

                               <div className="space-y-3">
                                  <label className="text-[9px] font-bold uppercase tracking-[0.3em] text-stone-400 ml-2">Key Memory (Optional)</label>
                                  <textarea 
                                    value={toastMemory}
                                    onChange={(e) => setToastMemory(e.target.value)}
                                    placeholder="e.g., That road trip in 2018, or how they first met at the cafe..."
                                    className="w-full h-full min-h-[120px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 rounded-3xl p-6 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all resize-none shadow-inner"
                                  />
                               </div>
                            </div>

                            <div className="flex justify-center">
                              <button 
                                onClick={handleGenerateToast}
                                disabled={isGeneratingToast}
                                className={`px-12 py-5 rounded-[2.5rem] bg-amber-500 text-white font-bold text-xs uppercase tracking-[0.3em] shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50`}
                              >
                                {isGeneratingToast ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                {isGeneratingToast ? 'Composing...' : 'Generate My Toast'}
                              </button>
                            </div>

                            {generatedToast && (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="p-10 md:p-14 rounded-[3.5rem] bg-white dark:bg-stone-900 border border-stone-200 dark:border-white/10 shadow-2xl space-y-8 relative group"
                              >
                                <div className="absolute top-8 left-8 text-6xl text-amber-500/10 font-serif leading-none italic">
                                  "
                                </div>
                                <div className="space-y-6 relative z-10">
                                   <div className="flex items-center justify-between">
                                      <p className="text-[10px] font-bold text-amber-500 uppercase tracking-[0.4em]">Gemini Composition</p>
                                      <button 
                                        onClick={async () => {
                                          await navigator.clipboard.writeText(generatedToast);
                                          showNotification("Toast copied to clipboard");
                                        }}
                                        className="text-[9px] font-bold text-stone-400 uppercase tracking-widest hover:text-stone-900 dark:hover:text-white transition-colors"
                                      >
                                        Copy Text
                                      </button>
                                   </div>
                                   <div className="whitespace-pre-wrap text-lg md:text-xl text-stone-800 dark:text-stone-300 font-serif leading-relaxed italic">
                                      {generatedToast}
                                   </div>
                                </div>
                                <div className="absolute bottom-8 right-8 text-6xl text-amber-500/10 font-serif leading-none italic">
                                  "
                                </div>
                              </motion.div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
                
                {/* QR Access Protocols - New Section */}
                {currentWedding && (
                  <div className="flex flex-col gap-6 w-full max-w-md">
                     <div className="glass-dark rounded-[2.5rem] p-8 space-y-6 border border-white/10">
                        <div className="flex items-center justify-between">
                           <div className="space-y-1">
                              <p className="text-[10px] font-bold text-white uppercase tracking-[0.4em]">Entry Protocol</p>
                              <p className="text-[10px] text-white/40 italic">Digital Key Synchronized</p>
                           </div>
                           <div className="flex flex-col items-center gap-3">
                              <div className="w-16 h-16 bg-white p-2 rounded-2xl flex items-center justify-center shadow-2xl">
                                 <QRCode id="qr-gallery-key" value={`https://eternal-moments.app/v/${currentWedding.id}`} size={48} />
                              </div>
                              <p className="text-[8px] font-mono text-white/40 uppercase">{currentWedding.id.slice(0, 12)}</p>
                              <button 
                                onClick={() => downloadQRCode("qr-gallery-key", "gallery-key")}
                                className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest hover:text-white transition-colors flex items-center gap-1"
                              >
                                 <Download className="w-2 h-2" /> Download Key
                              </button>
                           </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                           <button 
                             onClick={() => {
                               setCameraInitialMode("photo");
                               setShowCamera(true);
                             }}
                             className="py-5 rounded-2xl bg-white text-stone-900 font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:translate-y-[-2px] transition-all"
                           >
                              <Camera className="w-4 h-4" />
                              Scanner
                           </button>
                           <button 
                             onClick={() => setStep("upload")}
                             className="py-5 rounded-2xl bg-white/5 border border-white/10 text-white font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-white/10 transition-all"
                           >
                              <Upload className="w-4 h-4" />
                              File
                           </button>
                        </div>
                        
                        <div className="pt-4 border-t border-white/5">
                           <button 
                             onClick={() => {
                               showNotification("Deactivating temporary access codes...");
                             }}
                             className="w-full flex items-center justify-between group"
                           >
                              <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Terminate Active Codes</span>
                              <div className="w-10 h-6 rounded-full bg-red-500/20 p-1 flex items-center justify-end group-hover:bg-red-500/30 transition-all">
                                 <div className="w-4 h-4 rounded-full bg-red-400" />
                              </div>
                           </button>
                        </div>
                     </div>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {showControls && currentWedding && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0, y: -20 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -20 }}
                    className="overflow-hidden"
                  >
                    <div className="p-10 rounded-[3rem] glass-morphism border-2 border-stone-100 dark:border-white/5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                       <div className="space-y-4">
                         <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-stone-400">Signature Engine</p>
                         <div className="flex flex-col gap-2">
                           <button 
                             onClick={() => updateWatermarkSettings({ watermarkEnabled: !currentWedding.watermarkEnabled })}
                             className={`w-full py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${currentWedding.watermarkEnabled ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-900' : 'bg-stone-50 dark:bg-stone-900 text-stone-400'}`}
                           >
                             Watermark: {currentWedding.watermarkEnabled ? 'ENABLED' : 'DISABLED'}
                           </button>
                           <button 
                             onClick={() => setShowWatermarkModal(true)}
                             className="w-full py-4 rounded-xl border border-stone-200 dark:border-white/10 text-[10px] font-bold uppercase tracking-widest hover:bg-stone-50 dark:hover:bg-white/5"
                           >
                             Configure Aesthetics
                           </button>
                         </div>
                       </div>
                       
                       <div className="space-y-4">
                         <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-stone-400">Atmospheric Density</p>
                         <div className="grid grid-cols-2 gap-2">
                            {[0, 4, 10, 20].map((b) => (
                              <button 
                                key={b}
                                onClick={() => updateWatermarkSettings({ photoBlur: b })}
                                className={`py-4 rounded-xl text-[10px] font-bold transition-all ${currentWedding.photoBlur === b ? 'bg-indigo-600 text-white shadow-md' : 'bg-stone-50 dark:bg-stone-900 text-stone-400'}`}
                              >
                                {b === 0 ? 'Clear' : b === 4 ? 'Soft' : b === 10 ? 'Medium' : 'Deep'}
                              </button>
                            ))}
                         </div>
                       </div>

                        {!hideEventCode ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                               <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-stone-400">Access Key Protocol</p>
                               <button 
                                 onClick={() => setHideEventCode(true)}
                                 className="text-[8px] font-bold text-red-400 uppercase tracking-widest hover:text-red-500 transition-colors"
                               >
                                 Deactivate
                               </button>
                            </div>
                            <div className="p-5 rounded-3xl bg-white dark:bg-stone-900 border border-stone-100 dark:border-white/5 space-y-5">
                               <div className="flex items-center gap-4">
                                 <div className="flex flex-col items-center gap-2">
                                   <div className="w-16 h-16 rounded-2xl bg-stone-50 dark:bg-black p-2 flex items-center justify-center shadow-inner cursor-pointer" onClick={() => setShowShareModal(true)}>
                                     <QRCode value={`https://eternal-moments.app/v/${currentWedding.id}`} size={48} />
                                   </div>
                                   <p className="text-[8px] font-mono text-stone-400 dark:text-stone-600 uppercase">{currentWedding.id.slice(0, 12)}</p>
                                 </div>
                                 <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-900 dark:text-white">Entrance Key</p>
                                    <p className="text-[9px] text-stone-400 italic">Synchronized Protocol</p>
                                 </div>
                               </div>
                               
                               <div className="grid grid-cols-2 gap-3">
                                  <button 
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(currentWedding.id);
                                      showNotification("Key sequence secured");
                                    }}
                                    className="py-3 rounded-xl bg-stone-50 dark:bg-white/5 text-[10px] font-bold uppercase tracking-widest"
                                  >
                                    Protocol ID
                                  </button>
                                  <button 
                                    onClick={() => setShowShareModal(true)}
                                    className="py-3 rounded-xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest hover:translate-y-[-2px] transition-all"
                                  >
                                    Transmit
                                  </button>
                               </div>
                            </div>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setHideEventCode(false)}
                            className="w-full py-4 rounded-xl border border-dashed border-stone-200 dark:border-white/10 text-[8px] font-bold uppercase tracking-[0.3em] text-stone-400 hover:text-stone-900 dark:hover:text-white transition-all"
                          >
                            Restore Access Protocols
                          </button>
                        )}

                       <div className="space-y-4">
                         <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-stone-400">Sync Metadata</p>
                         <div className="flex items-center gap-2">
                            <div className="w-12 h-12 flex items-center justify-center text-green-500">
                               <CheckCircle2 className="w-6 h-6" />
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-widest leading-tight">Biometric Cloud<br/><span className="text-stone-400 font-normal">Synchronized</span></p>
                         </div>
                       </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showWatermarkModal && currentWedding && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-stone-900/40 backdrop-blur-md"
                  >
                    <motion.div 
                      key="watermark-modal-content"
                      initial={{ scale: 0.9, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.9, opacity: 0, y: 20 }}
                      transition={{ type: "spring", damping: 15, stiffness: 300 }}
                      className="bg-white rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl space-y-8"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-3xl font-serif italic text-stone-900">Watermark Stylist</h3>
                        <button onClick={() => setShowWatermarkModal(false)} className="p-2 hover:bg-stone-50 rounded-full transition-colors">
                          <X className="w-6 h-6 text-stone-400" />
                        </button>
                      </div>

                  <div className="space-y-6 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Signature Text</label>
                          <input 
                            type="text" 
                            value={currentWedding.watermarkText || ""}
                            onChange={(e) => updateWatermarkSettings({ watermarkText: e.target.value })}
                            className="w-full px-6 py-4 rounded-2xl bg-stone-50 border border-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-900/10 transition-all font-serif italic text-lg"
                          />
                        </div>

                        <div className="space-y-4">
                          <div className="flex justify-between items-center ml-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Typography Scale</label>
                            <span className="text-[10px] font-mono text-stone-500 font-bold">{currentWedding.watermarkTextSize || 24}px</span>
                          </div>
                          <input 
                            type="range" 
                            min="12" 
                            max="72" 
                            step="1"
                            value={currentWedding.watermarkTextSize || 24}
                            onChange={(e) => updateWatermarkSettings({ watermarkTextSize: parseInt(e.target.value) })}
                            className="w-full h-1.5 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-stone-900"
                          />
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Atmospheric Canvas Style</label>
                          <div className="grid grid-cols-2 gap-3">
                            {([
                              { id: "transparent", name: "Glass" },
                              { id: "bg-white/20", name: "Frost" },
                              { id: "bg-stone-900/40", name: "Obsidian" },
                              { id: "border-2 border-white/40", name: "Outline" }
                            ] as const).map((bg) => (
                              <button
                                key={bg.id}
                                onClick={() => updateWatermarkSettings({ watermarkBg: bg.id })}
                                className={`py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border flex items-center justify-center gap-2 ${
                                  currentWedding.watermarkBg === bg.id 
                                    ? 'bg-stone-900 text-white border-stone-900 shadow-lg' 
                                    : 'bg-white text-stone-400 border-stone-100'
                                }`}
                              >
                                <div className={`w-3 h-3 rounded-full border border-stone-200 ${bg.id === 'transparent' ? 'bg-stone-50' : bg.id}`} />
                                {bg.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Composition Position</label>
                          <div className="grid grid-cols-3 gap-3">
                            {(["top-left", "top-right", "center", "bottom-left", "bottom-right"] as const).map((pos) => (
                              <button
                                key={pos}
                                onClick={() => updateWatermarkSettings({ watermarkPosition: pos })}
                                className={`py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
                                  currentWedding.watermarkPosition === pos 
                                    ? 'bg-stone-900 text-white border-stone-900 shadow-lg shadow-stone-200' 
                                    : 'bg-white text-stone-400 border-stone-100 hover:border-stone-200'
                                }`}
                              >
                                {pos.replace("-", " ")}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex justify-between items-center ml-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Atmospheric Opacity</label>
                            <span className="text-[10px] font-mono text-stone-500 font-bold">{Math.round((currentWedding.watermarkOpacity ?? 0.4) * 100)}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.05"
                            value={currentWedding.watermarkOpacity ?? 0.4}
                            onChange={(e) => updateWatermarkSettings({ watermarkOpacity: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-stone-900"
                          />
                        </div>

                        <div className="pt-4 space-y-6 border-t border-stone-100">
                           <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                 <label className="text-[10px] font-bold uppercase tracking-widest text-stone-900">Liquid Glass Filter</label>
                                 <p className="text-[10px] text-stone-400 italic">Adds a silk-like texture</p>
                              </div>
                              <button 
                                onClick={() => updateWatermarkSettings({ liquidGlassEnabled: !currentWedding.liquidGlassEnabled })}
                                className={`w-12 h-6 rounded-full transition-all relative ${currentWedding.liquidGlassEnabled ? 'bg-stone-900' : 'bg-stone-200'}`}
                              >
                                 <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${currentWedding.liquidGlassEnabled ? 'left-7' : 'left-1'}`} />
                              </button>
                           </div>

                           <div className="space-y-4">
                             <div className="flex justify-between items-center ml-1">
                               <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Focus Depth (Blur)</label>
                               <span className="text-[10px] font-mono text-stone-500 font-bold">{currentWedding.photoBlur || 0}px</span>
                             </div>
                             <input 
                               type="range" 
                               min="0" 
                               max="20" 
                               step="1"
                               value={currentWedding.photoBlur || 0}
                               onChange={(e) => updateWatermarkSettings({ photoBlur: parseInt(e.target.value) })}
                               className="w-full h-1.5 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-stone-900"
                             />
                           </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => setShowWatermarkModal(false)}
                        className="w-full py-5 rounded-2xl bg-stone-900 text-white font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-stone-200"
                      >
                        Preserve Settings
                      </button>
                    </motion.div>
                  </motion.div>
                )}

                {showShareModal && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-6 md:p-12 bg-stone-900/40 backdrop-blur-md"
                  >
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      transition={{ type: "spring", damping: 15, stiffness: 300 }}
                      className="bg-white rounded-[2.5rem] p-12 w-full max-w-md shadow-2xl shadow-stone-900/20 space-y-8 text-center my-auto"
                    >
                      <div className="space-y-4">
                        <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-stone-100 shadow-inner">
                          <Share2 className="w-8 h-8 text-stone-900" />
                        </div>
                        <h3 className="text-3xl font-serif italic text-stone-900">Share Your Magic</h3>
                        <p className="text-stone-400 text-xs font-bold uppercase tracking-[0.2em]">Private Access Link</p>
                      </div>

                      <div className="space-y-6 text-left">
                        <div className="p-8 rounded-[2rem] bg-stone-50 border border-stone-100 space-y-8">
                           <div className="flex flex-col items-center gap-6">
                              <div className="p-6 bg-white rounded-3xl shadow-xl shadow-stone-200 group relative">
                                <QRCode 
                                  id="qr-share-magic"
                                  value={`https://eternal-moments.app/v/${currentWedding.id}`}
                                  size={160}
                                  bgColor="transparent"
                                  fgColor="#1c1917"
                                />
                                <div className="mt-4 px-4 py-2 bg-stone-50 rounded-xl flex items-center justify-center gap-2 border border-stone-100">
                                   <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Access Key:</span>
                                   <span className="text-xs font-mono font-bold text-stone-900">{currentWedding.id}</span>
                                </div>
                                <button 
                                  onClick={() => downloadQRCode("qr-share-magic", `wedding-${currentWedding.id.slice(0,8)}`)}
                                  className="absolute -bottom-3 -right-3 w-10 h-10 rounded-full bg-stone-900 text-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100"
                                  title="Download QR"
                                >
                                  <Download className="w-5 h-5" />
                                </button>
                              </div>
                              <button 
                                onClick={() => downloadQRCode("qr-share-magic", `wedding-${currentWedding.id.slice(0,8)}`)}
                                className="text-[10px] font-bold text-stone-900 uppercase tracking-widest hover:text-indigo-600 transition-colors flex items-center gap-2 mt-4"
                              >
                                <Download className="w-3 h-3" /> Download Entry Key
                              </button>
                              <div className="text-center space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-900">Entrance Key</p>
                                <p className="text-[10px] text-stone-400 italic">Scan to synchronize collection</p>
                              </div>
                           </div>
                           
                           <div className="h-[1px] w-full bg-stone-200/50" />

                           <div className="space-y-3">
                             <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Gallery Direct Link</p>
                             <div className="flex items-center justify-between gap-4">
                               <code className="flex-1 px-5 py-3 rounded-xl bg-white border border-stone-100 text-[10px] font-mono text-stone-500 overflow-hidden text-ellipsis whitespace-nowrap">
                                 eternal-moments.app/v/{currentWedding.id.slice(0, 8)}
                               </code>
                               <button 
                                 onClick={async () => {
                                   try {
                                     await navigator.clipboard.writeText(`https://eternal-moments.app/v/${currentWedding.id}`);
                                     setCopied(true);
                                     showNotification("Link copied to vault");
                                     setTimeout(() => setCopied(false), 2000);
                                   } catch (e) {
                                     console.error("Clipboard access failed:", e);
                                   }
                                 }}
                                 className="text-stone-900 hover:scale-110 transition-transform"
                               >
                                 {copied ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Share2 className="w-5 h-5" />}
                               </button>
                             </div>
                           </div>
                        </div>
                        
                        <div className="flex items-center justify-between px-2">
                           <div className="space-y-1">
                              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Limit Status</p>
                              <p className="text-xs font-serif italic text-stone-900">
                                Expires in: {currentWedding.sharingLimit === 'unlimited' ? 'No Expiry' : currentWedding.sharingLimit}
                              </p>
                           </div>
                           <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        </div>
                      </div>

                      <div className="pt-4 flex flex-col gap-3">
                        <button 
                          onClick={() => setShowShareModal(false)}
                          className="w-full py-5 rounded-2xl bg-stone-900 text-white font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-stone-200"
                        >
                          Done
                        </button>
                        <p className="text-[10px] text-stone-400 font-medium">Link is only accessible with your face verify token</p>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-10">
                {(showSelectionsOnly 
                  ? matchedPhotos.filter(p => savedPhotos.some(s => s.url === p.url)) 
                  : matchedPhotos
                ).map((photo, i) => (
                  <motion.div 
                    layout
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                    onClick={() => setSelectedPhoto(photo)}
                    className="group relative aspect-[4/5] rounded-[3rem] overflow-hidden shadow-2xl shadow-stone-200/50 dark:shadow-black/50 cursor-pointer bg-stone-100 dark:bg-stone-900 border border-stone-200/50 dark:border-white/5"
                  >
                    <img 
                      src={photo.url} 
                      className="w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-110"
                      style={{ filter: `blur(${currentWedding?.photoBlur || 0}px)` }}
                    />
                    
                    {/* Watermark Consistency */}
                    {currentWedding && (currentWedding.watermarkEnabled ?? true) && (
                      <div className={`absolute inset-0 p-4 pointer-events-none flex ${
                        currentWedding.watermarkPosition === 'top-left' ? 'items-start justify-start' :
                        currentWedding.watermarkPosition === 'top-right' ? 'items-start justify-end' :
                        currentWedding.watermarkPosition === 'bottom-left' ? 'items-end justify-start' :
                        currentWedding.watermarkPosition === 'bottom-right' ? 'items-end justify-end' :
                        'items-center justify-center'
                      }`} style={{ opacity: Math.max(0.1, currentWedding.watermarkOpacity ?? 0.4) }}>
                         <div className={`text-center space-y-1 p-4 rounded-2xl backdrop-blur-md border border-white/20 origin-center scale-[0.6] md:scale-90 ${currentWedding.watermarkBg || "transparent"}`}>
                            <Camera className="w-5 h-5 text-white mx-auto mb-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
                            <p className="font-serif italic text-white whitespace-nowrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" style={{ fontSize: `${(currentWedding.watermarkTextSize || 18)}px` }}>
                               {currentWedding.watermarkText || "E. Moments"}
                            </p>
                            <p className="text-[10px] text-white font-bold uppercase tracking-[0.4em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{currentWedding.date}</p>
                         </div>
                      </div>
                    )}
                    
                    {savedPhotos.some(s => s.url === photo.url) && (
                      <div className="absolute top-8 right-8 w-10 h-10 rounded-full bg-white dark:bg-stone-950 flex items-center justify-center shadow-2xl ring-1 ring-black/5 z-20">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      </div>
                    )}
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-10">
                       <div className="flex items-center justify-between">
                          <div className="space-y-1">
                             <p className="text-[10px] font-bold text-white uppercase tracking-widest opacity-60">Hand-Picked Masterpiece</p>
                             <p className="font-serif italic text-2xl text-white">{photo.name}</p>
                          </div>
                          <div className="flex gap-3">
                            <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 handleDownloadPhoto(photo.url, `E-Moment-${photo.id || i}.jpg`);
                               }}
                               className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/40 transition-all"
                            >
                               <Download className="w-5 h-5 text-white" />
                            </button>
                            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                               <Maximize2 className="w-5 h-5 text-white" />
                            </div>
                          </div>
                       </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {showSelectionsOnly && matchedPhotos.filter(p => savedPhotos.some(s => s.url === p.url)).length === 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-40 text-center space-y-8"
                >
                  <div className="w-24 h-24 rounded-[2rem] bg-stone-50 dark:bg-stone-900 flex items-center justify-center mx-auto border border-stone-100 dark:border-white/5">
                    <Heart className="w-10 h-10 text-stone-200" />
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-4xl font-serif italic text-stone-900 dark:text-white">The Sanctuary is empty</h3>
                    <p className="text-stone-400 text-sm font-medium">Select masterpieces from your personal collection to build your legacy.</p>
                  </div>
                  <button 
                    onClick={() => setShowSelectionsOnly(false)}
                    className="px-10 py-5 rounded-2xl glass-dark text-white text-[10px] font-bold uppercase tracking-widest"
                  >
                    Examine All Captures
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedPhoto && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-stone-900/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 md:p-12 overflow-hidden"
              onClick={() => setSelectedPhoto(null)}
            >
              {/* Close Button */}
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setSelectedPhoto(null)}
                className="absolute top-8 right-8 z-[210] w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-xl border border-white/20 transition-all font-bold group"
              >
                <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
              </motion.button>

              <div className="relative w-full h-full flex flex-col md:flex-row items-center justify-center gap-12 max-w-7xl mx-auto">
                {/* Navigation Controls */}
                {(() => {
                  const currentList = showSelectionsOnly 
                    ? matchedPhotos.filter(p => savedPhotos.some(s => s.url === p.url)) 
                    : matchedPhotos;
                  const idx = currentList.findIndex(p => p.id === selectedPhoto.id);
                  
                  return currentList.length > 1 ? (
                    <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const prevIdx = (idx - 1 + currentList.length) % currentList.length;
                          setSelectedPhoto(currentList[prevIdx]);
                        }}
                        className="fixed left-8 top-1/2 -translate-y-1/2 z-[250] w-16 h-16 rounded-full glass-dark flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all border border-white/10"
                      >
                        <ChevronLeft className="w-8 h-8" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextIdx = (idx + 1) % currentList.length;
                          setSelectedPhoto(currentList[nextIdx]);
                        }}
                        className="fixed right-8 top-1/2 -translate-y-1/2 z-[250] w-16 h-16 rounded-full glass-dark flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all border border-white/10"
                      >
                        <ChevronRight className="w-8 h-8" />
                      </button>
                    </>
                  ) : null;
                })()}

                {/* Photo Viewer */}
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 40 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="relative flex-1 w-full h-full flex items-center justify-center bg-transparent p-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="relative max-h-full aspect-auto rounded-[3rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)] border border-white/10 group">
                    <img 
                      src={selectedPhoto.url} 
                      className="max-h-[75vh] w-auto object-contain transition-transform duration-700 hover:scale-105"
                      style={{ filter: `blur(${currentWedding?.photoBlur || 0}px)` }}
                      alt={selectedPhoto.name}
                    />

                    {/* Quick Blur Controls */}
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-3 glass-dark p-2 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                       <button 
                         onClick={() => currentWedding && updateWatermarkSettings({ photoBlur: Math.max(0, (currentWedding.photoBlur || 0) - 2) })}
                         className="p-3 rounded-xl hover:bg-white/10 transition-colors text-white"
                       >
                          <Minus className="w-4 h-4" />
                       </button>
                       <div className="w-[1px] h-4 bg-white/20" />
                       <span className="text-[10px] font-bold font-mono px-2 text-white/60 uppercase">Density</span>
                       <div className="w-[1px] h-4 bg-white/20" />
                       <button 
                         onClick={() => currentWedding && updateWatermarkSettings({ photoBlur: Math.min(20, (currentWedding.photoBlur || 0) + 2) })}
                         className="p-3 rounded-xl hover:bg-white/10 transition-colors text-white"
                       >
                          <Plus className="w-4 h-4" />
                       </button>
                    </div>
                    
                    {/* Watermark in Zen Mode */}
                    {currentWedding && (currentWedding.watermarkEnabled ?? true) && (
                      <div className={`absolute inset-0 p-12 pointer-events-none flex ${
                        currentWedding.watermarkPosition === 'top-left' ? 'items-start justify-start' :
                        currentWedding.watermarkPosition === 'top-right' ? 'items-start justify-end' :
                        currentWedding.watermarkPosition === 'bottom-left' ? 'items-end justify-start' :
                        currentWedding.watermarkPosition === 'bottom-right' ? 'items-end justify-end' :
                        'items-center justify-center'
                      }`} style={{ opacity: Math.max(0.1, currentWedding.watermarkOpacity ?? 0.4) }}>
                         <div className={`text-center space-y-4 p-12 rounded-[2.5rem] backdrop-blur-lg border border-white/30 shadow-2xl ${currentWedding.watermarkBg || "transparent"}`}>
                            <Camera className="w-10 h-10 text-white mx-auto mb-4 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" />
                            <p className="font-serif italic text-white whitespace-nowrap drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" style={{ fontSize: `${(currentWedding.watermarkTextSize || 24) * 1.5}px` }}>
                               {currentWedding.watermarkText || "E. Moments"}
                            </p>
                            <p className="text-sm text-white font-bold uppercase tracking-[0.4em] drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">{currentWedding.date}</p>
                         </div>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Unified Photo Sidebar panel */}
                <motion.div 
                  initial={{ opacity: 0, x: 60 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="w-full md:w-[400px] glass-dark rounded-[4rem] p-12 flex flex-col gap-12 shadow-[0_50px_100px_rgba(0,0,0,0.7)] border border-white/10 ring-1 ring-white/5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                       <div className="w-2 h-14 bg-indigo-500 rounded-full" />
                       <div className="space-y-2">
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.5em]">{currentWedding ? "Sanctuary Link" : "Global Sanctuary"}</p>
                          <h3 className="text-5xl font-serif italic text-white leading-tight">Masterpiece</h3>
                       </div>
                    </div>
                    <p className="text-white/60 text-sm leading-relaxed">{currentWedding ? `${currentWedding.name} — ${currentWedding.date}` : "Archived Collection"}</p>
                  </div>

                  <div className="space-y-4 pt-10 border-t border-white/5">
                    <button 
                      onClick={() => handleDownloadPhoto(selectedPhoto.url, `E-Moment-Original-${selectedPhoto.id}.jpg`)}
                      className="w-full py-6 rounded-3xl bg-white text-stone-900 font-bold text-xs uppercase tracking-[0.3em] shadow-2xl hover:translate-y-[-4px] active:scale-95 transition-all flex items-center justify-center gap-4"
                    >
                      <Download className="w-5 h-5" />
                      Aesthetic Download
                    </button>
                    <button 
                      onClick={async () => {
                        if (!user || !selectedPhoto) return;
                        if (!savedPhotos.some(s => s.url === selectedPhoto.url)) {
                          const newSaved = [...savedPhotos, selectedPhoto];
                          setSavedPhotos(newSaved);
                          try {
                            await updateDoc(doc(db, "profiles", user.uid), {
                              savedPhotos: newSaved,
                              updatedAt: serverTimestamp()
                            });
                            showNotification("Added to your aesthetic selection");
                          } catch (e) {
                            console.error(e);
                            showNotification("Local save secured, cross-device sync pending");
                          }
                        }
                      }}
                      className="w-full py-8 rounded-[2rem] bg-indigo-600 text-white font-bold text-xs uppercase tracking-[0.3em] flex items-center justify-center gap-4 hover:translate-y-[-4px] active:scale-95 transition-all shadow-3xl shadow-indigo-600/30"
                    >
                      <CheckCircle2 className={`w-7 h-7 ${savedPhotos.some(s => s.url === selectedPhoto.url) ? 'text-white' : 'opacity-40'}`} />
                      {savedPhotos.some(s => s.url === selectedPhoto.url) ? 'Stored in Vault' : 'Direct Save Object'}
                    </button>
                    
                    <button 
                      onClick={() => {
                        updateWatermarkSettings({ coverUrl: selectedPhoto.url });
                        showNotification("Silhouette (Cover) updated");
                      }}
                      className="w-full py-8 rounded-[2rem] bg-white text-stone-900 font-bold text-xs uppercase tracking-[0.3em] flex items-center justify-center gap-4 hover:translate-y-[-4px] active:scale-95 transition-all shadow-xl"
                    >
                      <LayoutGrid className="w-7 h-7 opacity-60" />
                      Set Silhouette
                    </button>

                    <button 
                      onClick={() => downloadPhoto(selectedPhoto)}
                      className="w-full py-8 rounded-[2rem] bg-white text-stone-900 font-bold text-xs uppercase tracking-[0.3em] flex items-center justify-center gap-4 hover:translate-y-[-4px] active:scale-95 transition-all shadow-xl"
                    >
                      <Download className="w-7 h-7" />
                      Archive High-Res
                    </button>

                    <button 
                      onClick={() => setSelectedPhoto(null)}
                      className="w-full py-6 mt-4 text-[10px] font-bold text-white/30 uppercase tracking-[0.5em] hover:text-white transition-colors"
                    >
                      Close Viewport
                    </button>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation Bar */}
      <AnimatePresence>
        {showNav && isUiVisible && (
          <motion.div 
            initial={{ y: 150, opacity: 0, x: "-50%" }}
            animate={{ y: 0, opacity: 1, x: "-50%" }}
            exit={{ y: 150, opacity: 0, x: "-50%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`fixed bottom-10 left-1/2 z-[200] px-6 w-full max-w-xl transition-all duration-700 ${step === 'weddings' ? 'scale-90 opacity-40 hover:scale-100 hover:opacity-100' : ''}`}
          >
            <div className="glass-dark rounded-[3rem] p-4 flex items-center justify-between shadow-[0_40px_100px_rgba(0,0,0,0.6)] border border-white/10 ring-1 ring-white/5">
              <button 
                onClick={() => { setActiveTab("home"); setStep("welcome"); setCurrentWedding(null); }}
                className={`flex flex-col items-center gap-2 px-8 py-4 rounded-[2rem] transition-all ${activeTab === 'home' ? 'bg-white text-stone-900 shadow-xl scale-110' : 'text-stone-400 hover:text-white'}`}
              >
                <Home className="w-6 h-6" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Home</span>
              </button>
              <button 
                onClick={() => { setActiveTab("search"); setStep("weddings"); }}
                className={`flex flex-col items-center gap-2 px-8 py-4 rounded-[2rem] transition-all ${activeTab === 'search' ? 'bg-white text-stone-900 shadow-xl scale-110' : 'text-stone-400 hover:text-white'}`}
              >
                <Search className="w-6 h-6" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Search</span>
              </button>
              
              <div className="w-[1px] h-8 bg-white/10" />
    
              <button 
                onClick={() => { setActiveTab("user"); if (!user) { signInWithGoogle(); } else { setStep("profile"); } }}
                className={`flex flex-col items-center gap-2 px-8 py-4 rounded-[2rem] transition-all ${activeTab === 'user' ? 'bg-white text-stone-900 shadow-xl scale-110' : 'text-stone-400 hover:text-white'}`}
              >
                {user ? (
                  <img src={user.photoURL || ""} className="w-7 h-7 rounded-full ring-2 ring-white/10" />
                ) : (
                  <User className="w-6 h-6" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-widest">{user ? "Profile" : "Join"}</span>
              </button>
    
              <button 
                onClick={() => { setIsDark(!isDark); }}
                className="flex flex-col items-center gap-2 px-6 py-4 rounded-[2rem] text-stone-400 hover:text-white transition-all"
              >
                {isDark ? <Zap className="w-6 h-6 text-yellow-500 fill-yellow-500" /> : <Zap className="w-6 h-6" />}
                <span className="text-[10px] font-bold uppercase tracking-widest">{isDark ? "Sun" : "Moon"}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Join Wedding Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-stone-900/40 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[3rem] p-12 w-full max-w-md shadow-2xl space-y-10 text-center"
            >
              <div className="space-y-4">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-indigo-100 shadow-inner gap-1">
                  <Camera className="w-4 h-4 text-indigo-300" />
                  <QrCode className="w-8 h-8 text-indigo-500" />
                </div>
                <h3 className="text-3xl font-serif italic text-stone-900">Synchronize Protocol</h3>
                <p className="text-stone-400 text-xs font-bold uppercase tracking-widest leading-relaxed">Enter the high-fidelity access key provided by the sanctuary owner.</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-2">Access Key ID</label>
                  <input 
                    type="text" 
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                    placeholder="e.g. sanctuary-protocol-xyz"
                    className="w-full px-8 py-5 rounded-[2rem] bg-stone-50 border border-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all font-mono text-sm tracking-tighter"
                  />
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setCameraInitialMode("qr");
                      setShowCamera(true);
                    }}
                    className="flex-1 py-5 rounded-2xl border border-stone-100 font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-stone-50 transition-all text-indigo-600"
                  >
                    <QrCode className="w-4 h-4" /> Scan QR
                  </button>
                  <button 
                    onClick={() => setShowJoinModal(false)}
                    className="px-6 py-5 rounded-2xl bg-stone-100 text-stone-400 font-bold text-[10px] uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                </div>

                <button 
                  onClick={handleJoinWedding}
                  disabled={!joinId}
                  className="w-full py-6 rounded-[2rem] bg-stone-900 text-white font-bold text-xs uppercase tracking-[0.4em] shadow-2xl hover:translate-y-[-4px] active:scale-95 transition-all disabled:opacity-30 disabled:translate-y-0"
                >
                  Verify Protocol
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wedding Modals - Create & Edit */}
      <AnimatePresence>
        {(showCreateModal || showEditModal) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-stone-900/40 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[3rem] p-12 w-full max-w-xl shadow-[0_40px_100px_rgba(0,0,0,0.2)] space-y-10"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-4xl font-serif italic text-stone-900">
                  {showEditModal ? "Revise Sanctuary" : "Secure New Sanctuary"}
                </h3>
                <button 
                  onClick={() => { setShowCreateModal(false); setShowEditModal(false); }} 
                  className="p-3 hover:bg-stone-50 rounded-full transition-colors text-stone-400 hover:text-stone-900"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Sanctuary Moniker</label>
                  <input 
                    type="text" 
                    value={showEditModal && editingWedding ? editingWedding.name : newWeddingData.name}
                    onChange={(e) => {
                      if (showEditModal && editingWedding) {
                        setEditingWedding({...editingWedding, name: e.target.value});
                      } else {
                        setNewWeddingData({...newWeddingData, name: e.target.value});
                      }
                    }}
                    placeholder="e.g. The Everlasting Union of..."
                    className="w-full px-8 py-5 rounded-[2rem] bg-stone-50 border border-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-900/10 transition-all font-serif italic text-xl"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Temporal Anchor (Date)</label>
                  <input 
                    type="date" 
                    value={showEditModal && editingWedding ? editingWedding.date : newWeddingData.date}
                    onChange={(e) => {
                      if (showEditModal && editingWedding) {
                        setEditingWedding({...editingWedding, date: e.target.value});
                      } else {
                        setNewWeddingData({...newWeddingData, date: e.target.value});
                      }
                    }}
                    className="w-full px-8 py-5 rounded-[2rem] bg-stone-50 border border-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-900/10 transition-all text-sm font-bold uppercase tracking-widest"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Atmospheric Cover (Optional)</label>
                  <div 
                    onClick={() => coverInputRef.current?.click()}
                    className="w-full aspect-video rounded-[2rem] bg-stone-50 border border-stone-100 flex flex-col items-center justify-center cursor-pointer hover:bg-stone-100 transition-all overflow-hidden relative group"
                  >
                    {(showEditModal && editingWedding?.coverUrl) || newWeddingData.coverUrl ? (
                      <img 
                        src={showEditModal && editingWedding ? editingWedding.coverUrl : newWeddingData.coverUrl} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                        alt="Cover Preview"
                      />
                    ) : (
                      <>
                        <ImageIcon className="w-8 h-8 text-stone-200" />
                        <p className="text-[8px] font-bold uppercase tracking-widest text-stone-400 mt-2">Select Hero Image</p>
                      </>
                    )}
                    <div className="absolute inset-0 bg-stone-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <Plus className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <input 
                    type="file" 
                    ref={coverInputRef}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = URL.createObjectURL(file);
                        if (showEditModal && editingWedding) {
                          setEditingWedding({...editingWedding, coverUrl: url});
                        } else {
                          setNewWeddingData({...newWeddingData, coverUrl: url});
                        }
                      }
                    }}
                    className="hidden"
                    accept="image/*"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Session Duration</label>
                  <div className="grid grid-cols-4 gap-3">
                    {(["1h", "10h", "1d", "unlimited"] as const).map((limit) => (
                      <button
                        key={limit}
                        onClick={() => {
                          if (showEditModal && editingWedding) {
                            setEditingWedding({...editingWedding, sharingLimit: limit});
                          } else {
                            setNewWeddingData({...newWeddingData, sharingLimit: limit});
                          }
                        }}
                        className={`py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
                          (showEditModal && editingWedding ? editingWedding.sharingLimit : newWeddingData.sharingLimit) === limit 
                            ? 'bg-stone-900 text-white border-stone-900 shadow-xl' 
                            : 'bg-white text-stone-400 border-stone-100 hover:border-stone-200'
                        }`}
                      >
                        {limit}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button 
                  onClick={showEditModal ? handleUpdateWedding : handleCreateWedding}
                  disabled={showEditModal ? !editingWedding?.name || !editingWedding?.date : !newWeddingData.name || !newWeddingData.date}
                  className="w-full py-7 rounded-[2.5rem] bg-stone-900 text-white font-bold text-xs uppercase tracking-[0.4em] shadow-2xl hover:translate-y-[-4px] active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-4"
                >
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  {showEditModal ? "Sync Revisions" : "Initialize Protocol"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bubble Notifications */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-3 pointer-events-none items-center">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -20, transition: { duration: 0.15 } }}
              transition={{ type: "spring", damping: 12, stiffness: 250 }}
              className="px-8 py-4 rounded-full glass-dark text-white text-[11px] font-bold uppercase tracking-[0.3em] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center gap-4 border border-white/5"
            >
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-stone-100" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-white animate-ping" />
              </div>
              {n.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Onboarding Sequence */}
      <AnimatePresence>
        {onboardingStep !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-stone-900 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 20, stiffness: 100 }}
              className="bg-white rounded-[3rem] p-12 max-w-xl w-full text-center space-y-12 shadow-[0_0_100px_rgba(255,255,255,0.1)]"
            >
              <div className="space-y-6">
                <div className="w-24 h-24 bg-stone-50 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner border border-stone-100">
                  <Heart className="w-12 h-12 text-stone-300" />
                </div>
                <h2 className="text-5xl font-serif italic text-stone-900 leading-tight">Where did you start?</h2>
                <p className="text-xl text-stone-500 font-medium">A sanctuary for your most precious memories. Let us guide you through the artisan curation process.</p>
              </div>

              <div className="flex flex-col gap-4">
                <button 
                  onClick={completeOnboarding}
                  className="w-full py-6 rounded-3xl bg-stone-900 text-white font-bold text-xs uppercase tracking-[0.3em] shadow-2xl shadow-stone-200"
                >
                  Begin Journey
                </button>
                <button 
                  onClick={completeOnboarding}
                  className="w-full py-6 rounded-3xl bg-white text-stone-400 font-bold text-[10px] uppercase tracking-[0.3em] hover:text-stone-900 transition-colors"
                >
                  Skip Protocol
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="py-20 border-t border-stone-100 bg-white">
         <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="text-center md:text-left space-y-4">
              <span className="font-serif italic text-2xl text-stone-900">E. Moments</span>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-[0.3em] leading-relaxed max-w-xs">AI-Powered Wedding Registry for the Modern Celebration.</p>
            </div>
            <div className="flex items-center gap-10 text-[10px] font-bold uppercase tracking-[0.3em] text-stone-400">
               <a href="#" className="hover:text-stone-900 transition-colors">Safety</a>
               <a href="#" className="hover:text-stone-900 transition-colors">Privacy</a>
               <a href="#" className="hover:text-stone-900 transition-colors">Contact</a>
            </div>
         </div>
      </footer>
    </div>
  );
}

