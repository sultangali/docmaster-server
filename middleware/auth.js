import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Нет токена доступа' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Недействительный токен' 
    });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.log('❌ Authorization failed: No user in request');
      return res.status(401).json({ 
        success: false, 
        message: 'Не авторизован' 
      });
    }

    console.log(`🔐 Authorization check: User ${req.user.fullName} (${req.user.role}) trying to access roles: ${roles.join(', ')}`);

    if (!roles.includes(req.user.role)) {
      console.log(`❌ Authorization failed: User role "${req.user.role}" not in allowed roles: ${roles.join(', ')}`);
      return res.status(403).json({ 
        success: false, 
        message: 'Нет прав доступа' 
      });
    }

    console.log(`✅ Authorization successful for user ${req.user.fullName}`);
    next();
  };
};
