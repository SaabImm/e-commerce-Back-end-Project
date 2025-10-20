const Category = require('../Models/CategoryModel');
const mongoose = require('mongoose');

// 🟢 Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    if (categories.length === 0) {
      return res.status(404).json({ message: "No categories found" });
    }

    return res.status(200).json({
      message: "Categories retrieved successfully",
      categories
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", error });
  }
};

// 🟡 Get category by ID
exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.status(200).json({
      message: "Category retrieved successfully",
      category
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", error });
  }
};

// 🔵 Create a new category
exports.createCategory = async (req, res) => {
  try {
    const { name, description, image } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    // Prevent duplicates
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(409).json({ message: "Category already exists" });
    }

    const newCategory = new Category({ name, description, image });
    const savedCategory = await newCategory.save();

    return res.status(201).json({
      message: "Category created successfully",
      category: savedCategory
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", error });
  }
};
