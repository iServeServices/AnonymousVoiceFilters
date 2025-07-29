
// /server.js

import express from "express";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import cors from "cors";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Fix for ES modules: resolve __dirname and __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

const outputDir = path.join(__dirname, "output");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}
app.use("/output", express.static(outputDir));

app.post("/filter", upload.single("file"), async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== "anon-secret") {
    return res.status(401).json({ error: "Unauthorized" });
  }

const effect = req.body.effect;
const filters = {
  raw: null,  // No filter

  deep_echo: "aecho=0.6:0.7:700:0.25",  // Softer, less overlap
  bold_resonance: "asetrate=44100*0.9, atempo=1.1, bass=g=5, treble=g=-4, volume=1.2",  // Reduced echo tails
  gentle_whisper: "asetrate=70100*0.9, atempo=1.0, bass=g=25, volume=1.1",  // Clearer highs
  soft_echo: "aecho=0.5:0.6:600:0.2, lowpass=f=2500",  // Mellowed echo
  serene_melody: "asetrate=44100*0.9, atempo=1.05",  // Less warble
  bright_harmony: "treble=g=6, chorus=0.5:0.9:30:0.3:0.25:2",  // Smoother chorus
  anonymity_fade: "asetrate=44100*0.75, atempo=1.15",  // Balanced fade effect
  whisper_of_peace: "highpass=f=600, lowpass=f=3500, volume=0.85",  // More clarity
  echo_of_grace: "asetrate=44100*0.8, atempo=1.05, aecho=0.5:0.7:30:0.3"  // Gentler grace echo
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
    .on("start", cmd => console.log("🛠 FFmpeg command:", cmd))
    .on("error", err => {
      console.error("❌ FFmpeg error:", err.message);
      res.status(500).json({ error: "Filter failed", details: err.message });
    })
    .on("end", () => {
      console.log("✅ Filter applied:", outputPath);
      res.json({ filtered_url: `/output/${outputName}` });
    })
    .save(outputPath);
});

app.post("/resemble/upload", async (req, res) => {
  const { firebaseAudioUrl, voice_uuid, project_uuid } = req.body;
  if (!firebaseAudioUrl || !voice_uuid || !project_uuid) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const response = await axios.post(
      "https://anonymous-voice-filters.vercel.app/api/proxy",
      { firebaseAudioUrl, voice_uuid, project_uuid }
    );
    res.json(response.data);
  } catch (error) {
    console.error("❌ Resemble Upload Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Resemble upload failed", details: error.message });
  }
});

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
    const response = await axios.get(audioUrl, { responseType: "stream" });
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    writer.on("finish", () => res.json({ proxy_url: `/output/${outputName}` }));
    writer.on("error", err => {
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
