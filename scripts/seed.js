import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import User from '../models/User.js';

// Загружаем переменные окружения
dotenv.config();

const seedDatabase = async () => {
  try {
    console.log('🌱 Запуск инициализации базы данных...');
    
    // Подключаемся к MongoDB
    await connectDB();
    
    // Создаем админа по умолчанию
    const admin = await User.createDefaultAdmin();
    
    // Находим админа для использования как createdBy
    const adminUser = await User.findOne({ role: 'admins' });
    if (!adminUser) {
      throw new Error('Не удалось найти администратора');
    }
    
    console.log('✅ Администратор создан успешно');
    
    // Выводим статистику
    const adminCount = await User.countDocuments({ role: 'admins', isActive: true });
    
    console.log('\n📊 Статистика пользователей:');
    console.log(`   Админы: ${adminCount}`);
    
    console.log('\n🎉 Инициализация базы данных завершена!');
    console.log('\n🔐 Данные для входа:');
    console.log('   Админ: username = admin, password = admin123');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Ошибка инициализации:', error);
    process.exit(1);
  }
};

seedDatabase();
