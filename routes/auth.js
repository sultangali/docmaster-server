import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Генерация JWT токена
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

// @route   POST /api/auth/login
// @desc    Авторизация пользователя
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Проверяем обязательные поля
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Введите имя пользователя и пароль'
      });
    }

    // Ищем пользователя по username
    const user = await User.findOne({ 
      username: username.toLowerCase(),
      isActive: true 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Проверяем пароль в зависимости от роли
    let isPasswordValid = false;
    
    console.log('🔐 Debug авторизации:');
    console.log('   User role:', user.role);
    console.log('   User has password:', !!user.password);
    console.log('   Provided password:', password);
    
    if (user.role === 'admins') {
      // Для админов проверяем их индивидуальный пароль
      console.log('   Проверяем пароль админа...');
      
      if (!user.password) {
        console.log('   ❌ У админа нет пароля в БД, устанавливаем admin123');
        user.password = 'admin123';
        await user.save();
        console.log('   ✅ Пароль админа установлен');
      }
      
      isPasswordValid = await user.comparePassword(password);
      console.log('   Результат проверки пароля:', isPasswordValid);
    } else {
      // Для всех остальных ролей проверяем общий пароль
      console.log('   Проверяем общий пароль...');
      isPasswordValid = password === process.env.SHARED_PASSWORD;
      console.log('   Общий пароль в env:', process.env.SHARED_PASSWORD);
      console.log('   Результат проверки:', isPasswordValid);
    }

    if (!isPasswordValid) {
      console.log('   ❌ Авторизация неудачна');
      return res.status(401).json({
        success: false,
        message: user.role === 'admins' ? 'Неверный пароль администратора' : 'Неверный общий пароль'
      });
    }
    
    console.log('   ✅ Авторизация успешна');

    // Обновляем время последнего входа
    user.lastLogin = new Date();
    await user.save();

    // Генерируем токен
    const token = generateToken(user._id);

    // ВАЖНО: Получаем полные данные пользователя с populate после login
    const fullUserData = await User.findById(user._id)
      .populate('supervisor', 'lastname firstname fathername fullName degree language whatsapp email')
      .populate('supervisees', 'lastname firstname fathername fullName role OP language whatsapp email')
      .select('-password -__v');

    console.log('📋 Полные данные пользователя получены:', {
      role: fullUserData.role,
      hasSupervisor: !!fullUserData.supervisor,
      superviseesCount: fullUserData.supervisees?.length || 0
    });

    res.status(200).json({
      success: true,
      message: 'Успешная авторизация',
      data: {
        user: fullUserData,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера при авторизации'
    });
  }
});

// @route   GET /api/auth/users
// @desc    Получить список всех активных пользователей для выбора при логине
// @access  Public
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .select('username lastname firstname fathername role fullName')
      .sort({ role: 1, lastname: 1, firstname: 1 });

    // Группируем пользователей по ролям для удобства
    const groupedUsers = users.reduce((acc, user) => {
      const roleKey = user.role;
      if (!acc[roleKey]) {
        acc[roleKey] = [];
      }
      acc[roleKey].push({
        value: user.username,
        label: user.fullName,
        role: user.role,
        id: user._id
      });
      return acc;
    }, {});

    // Также возвращаем плоский массив для Select компонента
    const flatUsers = users.map(user => ({
      value: user.username,
      label: user.fullName,
      role: user.role,
      id: user._id
    }));

    res.status(200).json({
      success: true,
      data: {
        users: flatUsers,
        groupedUsers,
        total: users.length
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения списка пользователей'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Получить информацию о текущем пользователе
// @access  Private
router.get('/me', authenticate, async (req, res) => {
  try {
    // Получаем полные данные пользователя с populate
    const user = await User.findById(req.user._id)
      .populate('supervisor', 'lastname firstname fathername fullName degree language whatsapp email')
      .populate('supervisees', 'lastname firstname fathername fullName role OP language whatsapp email')
      .select('-password -__v');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    res.status(200).json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения данных пользователя'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Обновить токен
// @access  Private
router.post('/refresh', authenticate, async (req, res) => {
  try {
    const newToken = generateToken(req.user._id);
    
    res.status(200).json({
      success: true,
      data: { token: newToken }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка обновления токена'
    });
  }
});

// @route   POST /api/auth/create-admin
// @desc    Принудительное создание/обновление админа (только для отладки)
// @access  Public (только в development режиме)
router.post('/create-admin', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Эта функция недоступна в продакшене'
      });
    }

    // Удаляем существующего админа
    await User.deleteMany({ role: 'admins' });
    console.log('🗑️ Удалены все существующие админы');

    // Создаем нового админа
    const newAdmin = new User({
      lastname: 'Администратор',
      firstname: 'Системный',
      fathername: '',
      role: 'admins',
      whatsapp: '+77000000000',
      language: 'Русский',
      username: 'admin',
      password: 'admin123',
      isActive: true
    });

    await newAdmin.save();
    console.log('✅ Создан новый админ');

    // Проверяем что пароль работает
    const testResult = await newAdmin.comparePassword('admin123');
    console.log('🧪 Тест пароля:', testResult);

    res.status(200).json({
      success: true,
      message: 'Админ успешно создан',
      data: {
        username: 'admin',
        password: 'admin123',
        passwordTest: testResult
      }
    });

  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка создания админа',
      error: error.message
    });
  }
});

export default router;
