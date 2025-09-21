import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import User from '../models/User.js';

// Загружаем переменные окружения
dotenv.config();

const fixAdmin = async () => {
  try {
    console.log('🔧 Исправление администратора...');
    
    // Подключаемся к MongoDB
    await connectDB();
    
    // Ищем существующего админа
    const existingAdmin = await User.findOne({ role: 'admins' });
    
    if (existingAdmin) {
      console.log('📝 Найден существующий админ:', existingAdmin.username);
      
      // Проверяем есть ли у него пароль
      if (!existingAdmin.password) {
        console.log('❌ У админа нет пароля, устанавливаем admin123');
        existingAdmin.password = 'admin123';
        await existingAdmin.save();
        console.log('✅ Пароль админа обновлен');
      } else {
        console.log('🔐 У админа уже есть пароль, обновляем его');
        existingAdmin.password = 'admin123';
        await existingAdmin.save();
        console.log('✅ Пароль админа обновлен на admin123');
      }
      
      // Проверяем что username правильный
      if (existingAdmin.username !== 'admin') {
        existingAdmin.username = 'admin';
        await existingAdmin.save();
        console.log('✅ Username админа обновлен на admin');
      }
      
    } else {
      console.log('👤 Админа не найдено, создаем нового');
      await User.createDefaultAdmin();
    }
    
    // Проверяем что все работает
    const admin = await User.findOne({ username: 'admin', role: 'admins' });
    
    if (admin && admin.password) {
      console.log('🎉 Админ готов к использованию:');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   Хэшированный пароль:', admin.password.substring(0, 20) + '...');
      
      // Тестируем пароль
      const isPasswordValid = await admin.comparePassword('admin123');
      console.log('🧪 Тест пароля:', isPasswordValid ? '✅ Успешно' : '❌ Ошибка');
      
    } else {
      console.log('❌ Что-то пошло не так');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Ошибка исправления админа:', error);
    process.exit(1);
  }
};

fixAdmin();
