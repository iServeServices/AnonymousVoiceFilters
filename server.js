// /server.js

import express from "express";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import cors from "cors";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url"; // Import to handle file URLs
import { dirname } from "path"; // Import to get the current directory

// Get the current directory using import.meta.url
const __filename = fileURLToPath(import.meta.url);  // Corrected to __filename
const __dirname = dirname(__filename); // This replaces __dirname for ES Modules

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

// Ensure output folder exists
const outputDir = path.join(__dirname, "output");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}
app.use("/output", express.static(outputDir));

/**
 * 🎚 FFmpeg Filter Route
 */
app.post("/filter", upload.single("file"), async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== "anon-secret") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const effect = req.body.effect;

  const filters = {
    raw: null,
    deep_echo: "aecho=0.8:0.9:1000:0.3",
    bold_resonance: "bass=g=8, aecho=0.7:0.8:500:0.4",
    gentle_whisper: "highpass=f=300, treble=g=6, volume=0.8",
    soft_echo: "aecho=0.7:0.75:700:0.3, lowpass=f=2500",
    serene_melody: "asetrate=44100*0.85, atempo=1.1",
    bright_harmony: "treble=g=12, chorus=0.6:0.9:50:0.4:0.25:2",
    anonymity_fade: "asetrate=44100*0.7, atempo=1.2",
    whisper_of_peace: "highpass=f=600, lowpass=f=3500, volume=0.8",
    echo_of_grace: "asetrate=44100*0.75, atempo=1.1, aecho=0.6:0.88:40:0.4"
  };

  const filterCommand = filters[effect];
  if (!filterCommand && effect !== "raw") {
    return res.status(400).json({ error: "Unknown filter effect" });
  }

  let inputPath;

  if (req.file) {
    inputPath = path.join(__dirname, req.file.path);
  } else if (req.body.file_url) {
    const tempName = `input_${uuidv4()}.mp3`;
    inputPath = path.join(__dirname, "uploads", tempName);

    try {
      const response = await axios.get(req.body.file_url, { responseType: "stream" });
      const writer = fs.createWriteStream(inputPath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    } catch (err) {
      return res.status(500).json({ error: "Failed to download file_url", details: err.message });
    }
  } else {
    return res.status(400).json({ error: "Missing file or file_url" });
  }

  const outputName = `filtered_${Date.now()}.mp3`;
  const outputPath = path.join(outputDir, outputName);
  const command = ffmpeg(inputPath);

  if (filterCommand) {
    command.audioFilters(filterCommand);
  }

  command
    .on("start", cmd => {
      console.log("🛠 FFmpeg command:", cmd);
    })
    .on("error", (err) => {
      console.error("❌ FFmpeg error:", err.message);
      res.status(500).json({ error: "Filter failed", details: err.message });
    })
    .on("end", () => {
      console.log("✅ Filter applied:", outputPath);
      res.json({ filtered_url: `/output/${outputName}` });
    })
    .save(outputPath);
});

/**
 * 🤖 Resemble AI Upload (Clip Creation)
 */
app.post("/resemble/upload", async (req, res) => {
  const { firebaseAudioUrl, voice_uuid, project_uuid } = req.body;

  if (!firebaseAudioUrl || !voice_uuid || !project_uuid) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const response = await axios.post(
      "https://your-vercel-project.vercel.app/api/proxy",  // Vercel Proxy URL
      {
        firebaseAudioUrl,
        voice_uuid,
        project_uuid
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("❌ Resemble Upload Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Resemble upload failed", details: error.message });
  }
});

/**
 * 🌀 Resemble Audio Proxy Download
 */
app.post("/resemble/download", async (req, res) => {
  const { audioUrl } = req.body;
  const auth = req.headers.authorization;

  if (auth !== "anon-secret") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!audioUrl) {
    return res.status(400).json({ error: "Missing audioUrl" });
  }

  try {
    const outputName = `resemble_${Date.now()}.mp3`;
    const outputPath = path.join(__dirname, "output", outputName);

    const response = await axios.get(audioUrl, {
      responseType: "stream",
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    writer.on("finish", () => {
      res.json({ proxy_url: `/output/${outputName}` });
    });

    writer.on("error", (err) => {
      console.error("❌ Error writing Resemble file:", err.message);
      res.status(500).json({ error: "Failed to save Resemble audio" });
    });
  } catch (err) {
    console.error("❌ Resemble proxy error:", err.message);
    res.status(500).json({ error: "Resemble download failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🌍 Unified server is running on port ${PORT}`);
});
