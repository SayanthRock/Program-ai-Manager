import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Face Verification Endpoint
  // This is a proxy to Gemini to "find" the person in the gallery
  app.post("/api/verify-face", upload.single("selfie"), async (req, res) => {
    try {
      const selfieFile = req.file;
      const galleryUrls = JSON.parse(req.body.galleryUrls) as string[];

      if (!selfieFile || !galleryUrls.length) {
        return res.status(400).json({ error: "Missing selfie or gallery images" });
      }

      const selfiePart = {
        inlineData: {
          mimeType: selfieFile.mimetype,
          data: selfieFile.buffer.toString("base64"),
        },
      };

      // Fetch gallery images and convert to parts
      const galleryParts = await Promise.all(galleryUrls.map(async (url: string) => {
        try {
          if (url.startsWith("data:")) {
            const [mimePart, dataPart] = url.split(",");
            const mimeType = mimePart.split(":")[1].split(";")[0];
            return { inlineData: { mimeType, data: dataPart } };
          }
          if (url.startsWith("blob:")) return null;
          
          const imageRes = await fetch(url);
          if (!imageRes.ok) return null;
          const buffer = await imageRes.arrayBuffer();
          return {
            inlineData: {
              mimeType: imageRes.headers.get("content-type") || "image/jpeg",
              data: Buffer.from(buffer).toString("base64"),
            },
          };
        } catch (e) {
          return null;
        }
      }));

      const filteredGalleryParts = galleryParts.filter(Boolean) as any[];

      const prompt = `
        I am providing a "target" selfie and a series of gallery images.
        Identify the person in the selfie.
        For each gallery image provided (following the target selfie), determine if that same person appears prominently.
        
        Respond ONLY with a JSON array of the indices (0-based) of the gallery images that match. 
        Example: [0, 2] if the 1st and 3rd gallery images match.
        If no matches, respond with [].
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { 
          parts: [
            { text: prompt }, 
            { text: "Target Selfie:" },
            selfiePart, 
            { text: "Gallery Images:" },
            ...filteredGalleryParts 
          ] 
        },
        config: {
          responseMimeType: "application/json",
        },
      });

      const matchedIndices = JSON.parse(response.text || "[]");
      res.json({ matchedIndices });
    } catch (error: any) {
      console.error("Face verification error:", error);
      res.status(500).json({ error: "Failed to verify face", details: error.message });
    }
  });

  // Summarize Collection Endpoint
  app.post("/api/summarize-collection", async (req, res) => {
    try {
      const { imageUrls, weddingName } = req.body;

      if (!imageUrls || !imageUrls.length) {
        return res.status(400).json({ error: "Missing images" });
      }

      // To keep it efficient, we'll pick up to 5 representative images if the collection is large
      const representativeImages = imageUrls.slice(0, 8);

      // Create parts for Gemini
      // Note: In a real app, you'd fetch the images and convert to base64 or pass URLs if supported/public.
      // Since these are object URLs on the client, the server can't see them directly unless they are uploaded to storage.
      // ASSUMPTION: The user is passing URLs that are accessible or base64. 
      // If they are Firebase Storage URLs, we might need to fetch them.
      // For this prototype, let's assume we are passing base64 or we need to fetch them.
      // Wait, the client-side uses URL.createObjectURL for local files. 
      // If the photos were uploaded to Firestore/Firebase Storage, we'd have real URLs.
      // Let's check how photos are stored.
      
      const prompt = `
        You are looking at a collection of photos from a wedding named "${weddingName}".
        Based on these images, provide a brief, poetic, and aesthetic description of the collection. 
        Focus on the mood, the style, and the key moments captured. 
        Keep it under 100 words.
        Respond with a JSON object: { "summary": "your poetic description here" }
      `;

      // For this implementation, we'll fetch the images from the provided URLs if they are public.
      // If they are data URLs or public Firebase Storage URLs, we can fetch them.
      const imageParts = await Promise.all(representativeImages.map(async (url: string) => {
        try {
          if (url.startsWith("data:")) {
            const [mimePart, dataPart] = url.split(",");
            const mimeType = mimePart.split(":")[1].split(";")[0];
            return {
              inlineData: {
                mimeType: mimeType,
                data: dataPart,
              },
            };
          }
          if (url.startsWith("blob:")) {
             // We can't fetch blobs on the server. The client should have sent base64 or a real URL.
             return null;
          }
          const imageRes = await fetch(url);
          if (!imageRes.ok) throw new Error(`Status ${imageRes.status}`);
          const buffer = await imageRes.arrayBuffer();
          return {
            inlineData: {
              mimeType: imageRes.headers.get("content-type") || "image/jpeg",
              data: Buffer.from(buffer).toString("base64"),
            },
          };
        } catch (e: any) {
          console.error(`Failed to fetch image for Gemini: ${url}`, e.message);
          return null;
        }
      }));

      const filteredParts = imageParts.filter(Boolean) as any[];

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: [{ text: prompt }, ...filteredParts] },
        config: {
          responseMimeType: "application/json",
        },
      });

      const result = JSON.parse(response.text || "{}");
      res.json(result);
    } catch (error: any) {
      console.error("Summarization error:", error);
      res.status(500).json({ error: "Failed to summarize collection", details: error.message });
    }
  });

  // AI Wedding Toast Generator
  app.post("/api/generate-toast", async (req, res) => {
    try {
      const { relationship, tone, memory, weddingName } = req.body;

      const prompt = `
        Write a wedding toast for a wedding named "${weddingName}".
        Guest's relationship to the couple: ${relationship}
        Tone of the toast: ${tone}
        Key memory/point to include: ${memory || "None specified, just be general but heartfelt."}

        Requirements:
        - Keep it well-structured and engaging.
        - Ensure it fits the requested tone perfectly.
        - If tone is "Funny", include a light-hearted joke.
        - If tone is "Tear-jerker", focus on deep emotional connection.
        - Keep the output around 100-150 words.
        - Respond with a JSON object: { "toast": "the full toast text here" }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const result = JSON.parse(response.text || "{}");
      res.json(result);
    } catch (error: any) {
      console.error("Toast generation error:", error);
      res.status(500).json({ error: "Failed to generate toast", details: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
