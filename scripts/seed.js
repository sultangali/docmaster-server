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
    
    // Создаем тестовых пользователей для демонстрации
    const testUsers = [
      {
        lastname: 'Иванов',
        firstname: 'Иван',
        fathername: 'Иванович',
        role: 'magistrants',
        email: 'ivanov.ivan@example.com',
        whatsapp: '+77001234567',
        OP: '7M01503',
        language: 'Русский'
      },
      {
        lastname: 'Петров',
        firstname: 'Петр',
        fathername: 'Петрович',
        role: 'magistrants',
        email: 'petrov.petr@example.com',
        whatsapp: '+77001234568',
        OP: '7M06101',
        language: 'Қазақша'
      },
      {
        lastname: 'Сидоров',
        firstname: 'Сидор',
        fathername: 'Сидорович',
        role: 'doctorants',
        email: 'sidorov.sidor@example.com',
        whatsapp: '+77001234569',
        OP: '8D01103',
        language: 'Русский'
      },
      {
        lastname: 'Жумагулова',
        firstname: 'Сауле',
        fathername: 'Комековна',
        role: 'leaders',
        email: 'zhumagulova.saule@example.com',
        whatsapp: '+77001234570',
        degree: ['phd_assoc_prof'],
        language: 'Қазақша'
      },
      {
        lastname: 'Казимова',
        firstname: 'Динара',
        fathername: 'Ашубасаровна',
        role: 'leaders',
        email: 'kazimova.dinara@example.com',
        whatsapp: '+77001234571',
        degree: ['candidate_prof'],
        language: 'Русский'
      },
      {
        lastname: 'Спирина',
        firstname: 'Елена',
        fathername: 'Александровна',
        role: 'leaders',
        email: 'spirina.elena@example.com',
        whatsapp: '+77001234572',
        degree: ['candidate_prof'],
        language: 'Русский'
      },
      {
        lastname: 'Муратхан',
        firstname: 'Райхан',
        fathername: '',
        role: 'leaders',
        email: 'muratkhan.raihan@example.com',
        whatsapp: '+77001234573',
        degree: ['phd_assoc_prof'],
        language: 'Қазақша'
      },
      {
        lastname: 'Горбунова',
        firstname: 'Надежда',
        fathername: 'Александровна',
        role: 'leaders',
        email: 'gorbunova.nadezhda@example.com',
        whatsapp: '+77001234574',
        degree: ['assoc_prof'],
        language: 'Русский'
      }
    ];

    console.log('👥 Создание тестовых пользователей...');
    
    for (const userData of testUsers) {
      const existingUser = await User.findOne({ 
        lastname: userData.lastname, 
        firstname: userData.firstname 
      });
      
      if (!existingUser) {
        const user = new User({
          ...userData,
          createdBy: adminUser._id  // Указываем кто создал пользователя
        });
        await user.save();
        console.log(`✅ Создан пользователь: ${user.fullName} (${user.role})`);
      } else {
        console.log(`⚠️ Пользователь уже существует: ${existingUser.fullName}`);
      }
    }
    
    // Выводим статистику
    const stats = await Promise.all([
      User.countDocuments({ role: 'admins', isActive: true }),
      User.countDocuments({ role: 'magistrants', isActive: true }),
      User.countDocuments({ role: 'doctorants', isActive: true }),
      User.countDocuments({ role: 'leaders', isActive: true })
    ]);
    
    const [admins, magistrants, doctorants, leaders] = stats;
    const total = admins + magistrants + doctorants + leaders;
    
    console.log('\n📊 Статистика пользователей:');
    console.log(`   Админы: ${admins}`);
    console.log(`   Магистранты: ${magistrants}`);
    console.log(`   Докторанты: ${doctorants}`);
    console.log(`   Руководители: ${leaders}`);
    console.log(`   Всего: ${total}`);
    
    console.log('\n🎉 Инициализация базы данных завершена!');
    console.log('\n🔐 Данные для входа:');
    console.log('   Админ: username = admin, password = admin123');
    console.log('   Общий пароль (для магистрантов/докторантов/руководителей): docmaster2025');
    console.log('   Другие пользователи: username генерируется автоматически');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Ошибка инициализации:', error);
    process.exit(1);
  }
};

seedDatabase();
