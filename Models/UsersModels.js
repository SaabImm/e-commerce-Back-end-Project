const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  // ===== CORE IDENTITY =====
  name: { 
    type: String, 
    required: true,
    index: true  // For faster searches
  },
  lastname: { 
    type: String, 
    required: true,
    index: true
  },
  
  email: {  
    type: String, 
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Veuillez entrer une adresse email valide"],
    required: true,
    unique: true,
    lowercase: true,  // Normalize emails
    trim: true,
    index: true
  },
  
  password: {
    type: String, 
    required: true, 
    select: false,  // Never return in queries unless explicitly asked
    minlength: 8
  },
  
  passwordChangedAt: {
    type: Date,
    default: null
  },
  // ===== PROFILE & VISUALS =====
  profilePicture: {
    type: String,
    default: null
  },
  
  dateOfBirth: {
    type: Date,
    default: null
  },
  
  // ===== PROFESSIONAL INFO (Algerian Context) =====
  wilaya: {
    type: String,
    index: true
  },

  Region : {
    type: String,
    index: true
  },

  Sexe: {
    type: String,
    enum : ["femme", "homme"]
  },
  
  commune: String,
  
  profession: {
    type: String,
    index: true
  },
  
  registrationNumber: {  // Numéro d'inscription à l'ordre
    type: String,
    unique: true,
    sparse: true  // Allows null but enforces uniqueness when present
  },
  
  specialty: String,  // Spécialité médicale/architecturale/etc
  
  // ===== PERMISSION & ACCESS CONTROL =====
  role: {
    type: String, 
    enum: ['user', 'moderator', 'admin', 'super_admin'],
    required: true,
    default: 'user',
    index: true
  },
  
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'archived'],
    default: 'active',
    index: true
  },
  
  // ===== TENANT ISOLATION (Multi-"Conseil" ready) =====
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true,
    default: null  // Will be populated when multi-tenant is implemented
  },
  
  // ===== VERIFICATION & SECURITY =====
  isVerified: {
    type: Boolean,
    default: false
  },
  
  isAdminVerified: {
    type: Boolean,
    default: false
  },
  
  verificationToken: String,
  verificationTokenExpires: Date,
  
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  loginAttempts: {
    type: Number,
    default: 0
  },
  
  lockUntil: {
    type: Date,
    default: null
  },
  
  lastLogin: {
    type: Date,
    default: null
  },
  
  // ===== ACTIVITY TRACKING =====
  isActive: {
    type: Boolean,
    default: false
  },
  
  lastActivity: {
    type: Date,
    default: null
  },
  
  // ===== FILES & DOCUMENTS =====
  files: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'File' 
  }],
  
  // ===== PREFERENCES & SETTINGS =====
  preferences: {
    language: {
      type: String,
      enum: ['fr', 'ar', 'en'],
      default: 'fr'
    },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    }
  },
  
  // ===== AUDIT & METADATA =====
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
  
}, { 
  timestamps: true,  // Adds createdAt, updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===== VIRTUAL PROPERTIES =====
userSchema.virtual('fullName').get(function() {
  return `${this.name} ${this.lastname}`;
});

userSchema.virtual('isLocked').get(function() {
  return this.lockUntil && this.lockUntil > Date.now();
});

// ===== INDEXES =====
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, registrationNumber: 1 }, { sparse: true });
userSchema.index({ status: 1, role: 1 });
userSchema.index({ updatedAt: -1 });

// ===== INSTANCE METHODS =====
userSchema.methods.toSafeJSON = function() {
  const user = this.toObject();
  
  // Remove sensitive fields
  delete user.password;
  delete user.verificationToken;
  delete user.verificationTokenExpires;
  delete user.passwordResetToken;
  delete user.passwordResetExpires;
  delete user.loginAttempts;
  delete user.lockUntil;
  
  return user;
};

userSchema.methods.getProfileForPublic = function() {
  return {
    _id: this._id,
    fullName: this.fullName,
    profession: this.profession,
    specialty: this.specialty,
    wilaya: this.wilaya,
    profilePicture: this.profilePicture,
    // Only public-safe fields
  };
};

// ===== STATIC METHODS =====
userSchema.statics.findByEmail = function(email, tenantId = null) {
  const query = { email: email.toLowerCase().trim() };
  if (tenantId) query.tenantId = tenantId;
  return this.findOne(query);
};

userSchema.statics.findByRegistrationNumber = function(registrationNumber, tenantId = null) {
  const query = { registrationNumber };
  if (tenantId) query.tenantId = tenantId;
  return this.findOne(query);
};

// ===== MIDDLEWARE =====
userSchema.pre('save', function(next) {
  // Auto-generate registration number if not provided
  if (!this.registrationNumber && this.role === 'user') {
    // Format: ORDRE-YYYY-MM-XXXX (where XXXX is auto-increment)
    // You'll implement this with a counter collection
    this.registrationNumber = `PENDING-${Date.now()}`;
  }
  
  // Update timestamps
  if (this.isModified()) {
    this.updatedAt = new Date();
  }
  
  next();
});

// ===== PERMISSION-RELATED METHODS (Will use PermissionService) =====
userSchema.methods.getPermissionContext = function() {
  return {
    userId: this._id,
    role: this.role,
    tenantId: this.tenantId,
    status: this.status,
    isSelf: false  // To be set by PermissionService based on viewer
  };
};

module.exports = mongoose.model("User", userSchema);