const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');

const app = express();

// --- Middleware Configuration ---
app.use(express.json());
app.use(cors());

// --- Static Directory Setup for Uploaded Files ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- JSON Database File Paths ---
const USERS_FILE = './users.json';
const SUBJECTS_FILE = './subjects.json';
const CURRICULUM_FILE = './curriculum.json';

// --- Multer Storage Configuration for File Uploads ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        // Create folder if it doesn't exist
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Appending timestamp to avoid duplicate file name conflicts
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// --- Helper Function: Safely Read Data From JSON File ---
const getData = (file) => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, '[]');
        return [];
    }
    const data = fs.readFileSync(file, 'utf8');
    if (!data.trim()) return [];
    try {
        return JSON.parse(data);
    } catch (e) {
        console.error("JSON Error in file:", file);
        return [];
    }
};

// --- Helper Function: Save Data To JSON File ---
const saveData = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};


// ==========================================
//               USER ROUTES
// ==========================================

// 1. User Registration Route
app.post('/register', async (req, res) => {
    const { name, branch, email, mobile, password } = req.body;

    if (!name || !branch || !email || !mobile || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    let users = getData(USERS_FILE);

    // Check unique validations
    const existingEmail = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (existingEmail) return res.status(400).json({ message: 'Email already registered' });

    const existingName = users.find(u => u.name && u.name.toLowerCase() === name.toLowerCase());
    if (existingName) return res.status(400).json({ message: 'Username already taken' });

    const existingMobile = users.find(u => u.mobile === mobile);
    if (existingMobile) return res.status(400).json({ message: 'Mobile number already registered' });

    try {
        // Hash the password for security
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = {
            id: Date.now(),
            name,
            branch,
            email,
            mobile,
            password: passwordHash
        };

        users.push(newUser);
        saveData(USERS_FILE, users);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// 2. User Login Route
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Email and Password are required' });

        let users = getData(USERS_FILE);
        const user = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        if (!user) return res.status(400).json({ message: 'Invalid Email or Password' });

        if (!user.password) return res.status(400).json({ message: 'Account issue: Password missing or invalid input' });

        // Compare hashed password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid Email or Password' });

        res.json({
            message: 'Login successful',
            user: { name: user.name, branch: user.branch }
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error during login' });
    }
});

// 3. Reset Password Route
app.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        if (!email || !newPassword) return res.status(400).json({ message: 'Email and New Password are required' });

        let users = getData(USERS_FILE);
        const userIndex = users.findIndex(u => u.email && u.email.toLowerCase() === email.toLowerCase());

        if (userIndex === -1) return res.status(400).json({ message: 'Invalid Email address' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        users[userIndex].password = passwordHash;
        saveData(USERS_FILE, users);
        res.json({ message: 'Password reset successful!' });
    } catch (err) {
        res.status(500).json({ message: 'Server error during password reset' });
    }
});


// ==========================================
//             SUBJECT MANAGEMENT ROUTES
// ==========================================

// 4. Get Filtered Subjects Route (Based on Scheme and Semester)
app.get('/get-subjects', (req, res) => {
    const { scheme, sem } = req.query;
    let subjects = getData(SUBJECTS_FILE);

    if (!scheme || !sem) return res.status(400).json({ message: "Missing parameters" });

    const filtered = subjects.filter(s =>
        s.scheme.toLowerCase() === scheme.toLowerCase() &&
        s.sem.toLowerCase() === sem.toLowerCase()
    );
    res.json(filtered);
});

// 5. Add New Subject Route
app.post('/add-subject', (req, res) => {
    try {
        const { name, branch, scheme, sem } = req.body;

        if (!name || !scheme || !sem) {
            return res.status(400).json({ message: "Name, Scheme, and Sem are required" });
        }

        let subjects = getData(SUBJECTS_FILE);

        const newSubject = {
            id: "sub_" + Date.now(),
            name,
            branch: branch || "CME",
            scheme: scheme.toLowerCase(),
            sem: sem.toLowerCase(),
            notes: [],
            pyqs: [],
            video: []
        };

        subjects.push(newSubject);
        saveData(SUBJECTS_FILE, subjects);
        res.status(201).json({ message: "Subject added successfully!", subject: newSubject });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error while adding subject" });
    }
});

// 6. Get All Subjects Route (Admin Panel Overview)
app.get('/get-all-subjects', (req, res) => {
    try {
        let subjects = getData(SUBJECTS_FILE);
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ message: "Server error while fetching data" });
    }
});

// 7. Update Subject Materials Route (Supports Multiple Uploads & Array Types)
app.post('/update-subject-materials', upload.any(), (req, res) => {
    try {
        const { id, videoUrls } = req.body;

        if (!id) return res.status(400).json({ message: "Subject ID is required" });

        let subjects = getData(SUBJECTS_FILE);
        const subIndex = subjects.findIndex(s => s.id === id);

        if (subIndex === -1) return res.status(404).json({ message: "Subject not found" });

        // Array Integrity Enforcement Check
        if (!Array.isArray(subjects[subIndex].notes)) {
            const oldNotes = subjects[subIndex].notes;
            subjects[subIndex].notes = oldNotes && oldNotes.trim() !== "" ? [oldNotes] : [];
        }
        if (!Array.isArray(subjects[subIndex].pyqs)) {
            const oldPyqs = subjects[subIndex].pyqs;
            subjects[subIndex].pyqs = oldPyqs && oldPyqs.trim() !== "" ? [oldPyqs] : [];
        }
        if (!Array.isArray(subjects[subIndex].video)) {
            const oldVideo = subjects[subIndex].video;
            subjects[subIndex].video = oldVideo && oldVideo.trim() !== "" ? [oldVideo] : [];
        }

        // Process Uploaded Files dynamically via Multer fieldprefixes
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const fileUrl = `http://localhost:5001/uploads/${file.filename}`;

                if (file.fieldname.startsWith('notesFile')) {
                    subjects[subIndex].notes.push(fileUrl);
                } else if (file.fieldname.startsWith('pyqsFile')) {
                    subjects[subIndex].pyqs.push(fileUrl);
                } else if (file.fieldname.startsWith('videoFile')) {
                    subjects[subIndex].video.push(fileUrl);
                }
            });
        }

        // Handle text-based input URLs for Videos
        if (videoUrls) {
            const urls = Array.isArray(videoUrls) ? videoUrls : [videoUrls];
            urls.forEach(url => {
                if (url && url.trim() !== "" && !subjects[subIndex].video.includes(url.trim())) {
                    subjects[subIndex].video.push(url.trim());
                }
            });
        }

        saveData(SUBJECTS_FILE, subjects);
        res.json({ message: "All materials uploaded successfully!", subject: subjects[subIndex] });
    } catch (err) {
        console.error("Upload Error:", err);
        res.status(500).json({ message: "Server error during multiple upload" });
    }
});

// 8. Delete Entire Subject Route
app.delete('/delete-subject/:id', (req, res) => {
    try {
        const { id } = req.params;
        let subjects = getData(SUBJECTS_FILE);

        const updatedSubjects = subjects.filter(s => s.id !== id);

        if (subjects.length === updatedSubjects.length) {
            return res.status(404).json({ message: "Subject not found" });
        }

        saveData(SUBJECTS_FILE, updatedSubjects);
        res.json({ message: "Subject deleted successfully!" });
    } catch (err) {
        res.status(500).json({ message: "Server error during deletion" });
    }
});

// 9. Delete Specific Material File Route (Both Database and Local Storage)
app.post('/delete-material', (req, res) => {
    try {
        const { subjectId, type, fileUrl } = req.body; // type: 'notes', 'pyqs', or 'video'

        if (!subjectId || !type || !fileUrl) {
            return res.status(400).json({ message: "Missing required parameters" });
        }

        let subjects = getData(SUBJECTS_FILE);
        const subIndex = subjects.findIndex(s => s.id === subjectId);

        if (subIndex === -1) return res.status(404).json({ message: "Subject not found" });

        if (!Array.isArray(subjects[subIndex][type])) {
            return res.status(400).json({ message: "Invalid material type" });
        }

        const initialLength = subjects[subIndex][type].length;
        subjects[subIndex][type] = subjects[subIndex][type].filter(url => url !== fileUrl);

        if (subjects[subIndex][type].length === initialLength) {
            return res.status(404).json({ message: "File not found in database" });
        }

        // Unlink and remove the actual local asset if hosted inside the uploads directory
        if (fileUrl.includes('/uploads/')) {
            const fileName = fileUrl.split('/').pop();
            const filePath = path.join(__dirname, 'uploads', fileName);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Successfully deleted file from disk: ${fileName}`);
            }
        }

        saveData(SUBJECTS_FILE, subjects);
        res.json({ message: "Material deleted successfully!", subject: subjects[subIndex] });
    } catch (err) {
        console.error("Delete Material Error:", err);
        res.status(500).json({ message: "Server error during material deletion" });
    }
});


// ==========================================
//            CURRICULUM MANAGEMENT
// ==========================================

// 10. Add/Update Curriculum Route
app.post('/add-curriculum', upload.single('curriculumFile'), (req, res) => {
    try {
        const { branch, scheme } = req.body;

        if (!branch || !scheme || !req.file) {
            return res.status(400).json({ message: "Branch, Scheme, and PDF File are required" });
        }

        let curriculums = getData(CURRICULUM_FILE);
        const fileUrl = `http://localhost:5001/uploads/${req.file.filename}`;

        const existingIndex = curriculums.findIndex(c =>
            c.branch.toLowerCase() === branch.toLowerCase() &&
            c.scheme.toLowerCase() === scheme.toLowerCase()
        );

        if (existingIndex !== -1) {
            // Delete old file from storage if updating curriculum link
            const oldUrl = curriculums[existingIndex].url;
            if (oldUrl.includes('/uploads/')) {
                const oldFileName = oldUrl.split('/').pop();
                const oldFilePath = path.join(__dirname, 'uploads', oldFileName);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            }
            curriculums[existingIndex].url = fileUrl;
            curriculums[existingIndex].updatedAt = Date.now();
        } else {
            // Push new curriculum data entry
            const newCurriculum = {
                id: "cur_" + Date.now(),
                branch: branch.toUpperCase(),
                scheme: scheme.toLowerCase(),
                url: fileUrl,
                updatedAt: Date.now()
            };
            curriculums.push(newCurriculum);
        }

        saveData(CURRICULUM_FILE, curriculums);
        res.status(200).json({ message: "Curriculum uploaded successfully!", url: fileUrl });

    } catch (err) {
        console.error("Curriculum Upload Error:", err);
        res.status(500).json({ message: "Server error during curriculum upload" });
    }
});

// 11. Fetch Specific Curriculum Link Route
app.get('/get-curriculum', (req, res) => {
    try {
        const { branch, scheme } = req.query;

        if (!branch || !scheme) {
            return res.status(400).json({ message: "Missing branch or scheme parameters" });
        }

        let curriculums = getData(CURRICULUM_FILE);

        const found = curriculums.find(c =>
            c.branch.toLowerCase() === branch.toLowerCase() &&
            c.scheme.toLowerCase() === scheme.toLowerCase()
        );

        if (!found) {
            return res.status(404).json({ message: "Curriculum not found for this branch and scheme" });
        }

        res.json({ url: found.url });
    } catch (err) {
        console.error("Fetch Curriculum Error:", err);
        res.status(500).json({ message: "Server error while fetching curriculum" });
    }
});

// 12. Delete Curriculum Entry and Local File Asset Route
app.delete('/delete-curriculum/:id', (req, res) => {
    try {
        const { id } = req.params;
        let curriculums = getData(CURRICULUM_FILE);

        const found = curriculums.find(c => c.id === id);
        if (!found) {
            return res.status(404).json({ message: "Curriculum not found" });
        }

        // Delete actual storage asset
        if (found.url.includes('/uploads/')) {
            const fileName = found.url.split('/').pop();
            const filePath = path.join(__dirname, 'uploads', fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        curriculums = curriculums.filter(c => c.id !== id);
        saveData(CURRICULUM_FILE, curriculums);

        res.json({ message: "Curriculum deleted successfully!" });
    } catch (err) {
        console.error("Delete Curriculum Error:", err);
        res.status(500).json({ message: "Server error during curriculum deletion" });
    }
});

// 13. Get All Curriculums Route (Admin View Table Populate)
app.get('/get-all-curriculums', (req, res) => {
    try {
        let curriculums = getData(CURRICULUM_FILE);
        res.json(curriculums);
    } catch (err) {
        res.status(500).json({ message: "Server error while fetching curriculums" });
    }
});

// --- Server Startup ---
const PORT = 5001;
app.listen(PORT, () => console.log(`🚀 Server running smoothly on http://localhost:${PORT}`));