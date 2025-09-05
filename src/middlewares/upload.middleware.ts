import multer from "multer";
import path from "path";

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = "uploads/";

    // Determine upload path based on field name
    if (file.fieldname === "productImage") {
      uploadPath += "products/";
    } else if (file.fieldname === "cartImage") {
      uploadPath += "cart/";
    } else if (file.fieldname === "stickerImages") {
      uploadPath += "stickers/";
    } else {
      uploadPath += "general/";
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    const filename = file.fieldname + "-" + uniqueSuffix + extension;
    cb(null, filename);
  },
});

// File filter
const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Check file type
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10, // Maximum 10 files
  },
});

// Export different upload configurations
export const uploadProductImage = upload.single("productImage");
export const uploadCartImage = upload.single("cartImage");
export const uploadStickerImages = upload.array("stickerImages", 5); // Max 5 sticker images
export const uploadMultipleImages = upload.fields([
  { name: "productImage", maxCount: 1 },
  { name: "stickerImages", maxCount: 5 },
]);

// Error handling middleware
export const handleUploadError = (
  error: any,
  req: any,
  res: any,
  next: any
) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "File too large. Maximum size is 5MB." });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ message: "Too many files. Maximum is 10 files." });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ message: "Unexpected field name." });
    }
  }

  if (error.message === "Only image files are allowed!") {
    return res.status(400).json({ message: "Only image files are allowed!" });
  }

  next(error);
};
