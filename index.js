const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const PORT = 3000;

// Middleware to parse JSON body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Serve the main HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "public", "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

// File filter for allowed file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "video/mp4",
    "video/mpeg",
    "audio/mp3",
    "application/vnd.android.package-archive",
    "text/x-lua"
  ];

  const allowedExtensions = [".apk", ".lua"];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images, videos, APK, and LUA files are allowed."), false);
  }
};

const upload = multer({ storage, fileFilter });

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Path for storing metadata
const metadataFilePath = path.join(__dirname, "file.json");
const usersFilePath = path.join(__dirname, "users.json");

// Load metadata from file.json if it exists
let fileMetadata = [];
if (fs.existsSync(metadataFilePath)) {
  try {
    const data = fs.readFileSync(metadataFilePath, "utf8");
    fileMetadata = JSON.parse(data);
  } catch (err) {
    console.error("Failed to parse file.json:", err);
    fileMetadata = [];
  }
}

// Load users from users.json if it exists
let users = {};
if (fs.existsSync(usersFilePath)) {
  try {
    const data = fs.readFileSync(usersFilePath, "utf8");
    users = JSON.parse(data);
  } catch (err) {
    console.error("Failed to parse users.json:", err);
    users = {};
  }
}

// Save metadata to file.json
const saveMetadataToFile = () => {
  fs.writeFileSync(metadataFilePath, JSON.stringify(fileMetadata, null, 2), "utf8");
};

// Save users to users.json
const saveUsersToFile = () => {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), "utf8");
};

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

// Register endpoint
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (users[username]) {
    return res.status(400).json({ error: "Username already exists" });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  users[username] = { password: hashedPassword };
  saveUsersToFile();
  res.status(200).json({ message: "User registered successfully" });
});

// Login endpoint
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!users[username]) {
    return res.status(400).json({ error: "User not found" });
  }
  const match = await bcrypt.compare(password, users[username].password);
  if (match) {
    req.session.user = username;
    res.status(200).json({ message: "Logged in successfully" });
  } else {
    res.status(400).json({ error: "Invalid password" });
  }
});

// Logout endpoint
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Could not log out" });
    }
    res.status(200).json({ message: "Logged out successfully" });
  });
});

// Upload endpoint
app.post("/upload", isAuthenticated, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File is required." });
  }

  // Add new metadata
  const newFile = {
    name: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    user: req.session.user,
    uploadedAt: new Date().toISOString(),
  };

  fileMetadata.push(newFile);

  // Save updated metadata to file.json
  saveMetadataToFile();

  res.status(200).json({ message: "File uploaded successfully.", file: newFile });
});

// List files with metadata
app.get("/file/list", isAuthenticated, (req, res) => {
  res.status(200).json(fileMetadata);
});

// Delete file endpoint
app.delete("/file/:filename", isAuthenticated, (req, res) => {
  const { filename } = req.params;
  const fileIndex = fileMetadata.findIndex(file => file.name === filename);

  if (fileIndex === -1) {
    return res.status(404).json({ error: "File not found" });
  }

  if (fileMetadata[fileIndex].user !== req.session.user) {
    return res.status(403).json({ error: "You can only delete your own files" });
  }

  const filePath = path.join(__dirname, "public", "uploads", filename);
  fs.unlinkSync(filePath);

  fileMetadata.splice(fileIndex, 1);
  saveMetadataToFile();

  res.status(200).json({ message: "File deleted successfully" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});