const jwt = require("jsonwebtoken");


const authorizeRoles = (...allowedRoles)=> {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ message: "User not authenticated" });

        if (!req.canActOnFile && !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: "Access forbidden: insufficient permissions" });
        }
        next();
    };
}

module.exports = authorizeRoles;