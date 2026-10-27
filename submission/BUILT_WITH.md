# Project name, tagline and "Built with"

## Name
**OptiInspect**

## Tagline
- Short: **Inspection that takes a second look.**
- One sentence: **A visual inspector that checks itself, asks a person when it is unsure, and keeps a record nobody can quietly change.**

## Built with (only what is actually in the project)

**Computer vision**
- OpenCV 5.0.0.93 (`opencv-python`): image alignment (phase correlation, ECC), edge-aware difference, contours, CLAHE contrast, resizing, heat maps
- NumPy 2.5.4

**Backend**
- Python 3.14
- Flask 3.1.3 (local web server and JSON API, serves the built React app)
- Local accounts with scrypt password hashes (Werkzeug), signed cookie sessions, CSRF header, three roles, sign-in lockout
- Files on disk for storage (JSON results, JSONL audit logs, JSON accounts); SHA-256 hash chain from Python's standard library

**Frontend**
- React 19, Vite 8, React Router 7
- Framer Motion (animation), Lucide (icons)
- Hand-written SVG charts and a canvas scanner animation (no chart library)
- CSS custom properties for dark, light and system themes
- Bricolage Grotesque typeface (SIL Open Font License), included in the project so it works offline

**Data**
- MVTec AD, "bottle" category (Bergmann, Fauser, Sattlegger, Steger, CVPR 2019), CC BY-NC-SA 4.0. Not redistributed.

**Development tools**
- Claude Code (Claude Sonnet 5.5), Node.js, Visual Studio Code, PowerShell, Google Chrome

## Not used (so do not list them)
- **AWS** (Lambda, S3, API Gateway, DynamoDB, Bedrock): the project does not use any AWS service. An early Bedrock draft is archived in `archive_aws/` and was never run.
- Any trained neural network or AI model inside the product. The agent chooses its next check with simple rules.
