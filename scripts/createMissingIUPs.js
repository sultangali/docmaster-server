import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import IUP from '../models/IUP.js';

// Загрузка переменных окружения
dotenv.config();

const createMissingIUPs = async () => {
  try {
    // Подключение к MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Подключено к MongoDB');

    const currentYear = new Date().getFullYear();
    
    // Находим всех активных магистрантов с назначенными руководителями
    const magistrants = await User.find({ 
      role: 'magistrants', 
      isActive: true,
      supervisor: { $exists: true, $ne: null }
    }).populate('supervisor', 'lastname firstname fathername fullName');

    console.log(`\n📊 Найдено магистрантов с руководителями: ${magistrants.length}\n`);

    let iupsCreated = 0;
    let iupsExisted = 0;
    let errors = 0;

    for (const magistrant of magistrants) {
      try {
        // Проверяем, есть ли уже ИУП на текущий год
        const existingIUP = await IUP.findOne({
          student: magistrant._id,
          year: currentYear,
          isActive: true
        });

        if (existingIUP) {
          console.log(`✅ ${magistrant.fullName} - ИУП уже существует`);
          iupsExisted++;
          continue;
        }

        // Создаем ИУП
        const newIUP = await IUP.createWithDefaultStages(
          magistrant._id,
          magistrant.supervisor._id,
          magistrant.OP,
          magistrant.language
        );

        console.log(`🎯 ${magistrant.fullName} - ИУП создан (ID: ${newIUP._id})`);
        console.log(`   Руководитель: ${magistrant.supervisor.fullName}`);
        console.log(`   ОП: ${magistrant.OP}, Язык: ${magistrant.language}`);
        iupsCreated++;

      } catch (error) {
        console.error(`❌ ${magistrant.fullName} - Ошибка создания ИУП:`, error.message);
        errors++;
      }
    }

    // Находим магистрантов без руководителей
    const magistrantsWithoutSupervisors = await User.find({
      role: 'magistrants',
      isActive: true,
      $or: [
        { supervisor: { $exists: false } },
        { supervisor: null }
      ]
    });

    console.log(`\n📈 ИТОГИ:`);
    console.log(`✅ ИУП создано: ${iupsCreated}`);
    console.log(`ℹ️ ИУП уже существовало: ${iupsExisted}`);
    console.log(`❌ Ошибок: ${errors}`);
    console.log(`⚠️ Магистрантов без руководителей: ${magistrantsWithoutSupervisors.length}`);

    if (magistrantsWithoutSupervisors.length > 0) {
      console.log(`\n🚨 МАГИСТРАНТЫ БЕЗ РУКОВОДИТЕЛЕЙ:`);
      magistrantsWithoutSupervisors.forEach(student => {
        console.log(`   - ${student.fullName} (${student.email})`);
      });
      console.log(`\n💡 Для этих студентов нужно назначить руководителей`);
      console.log(`   Используйте: node scripts/checkUserSupervisors.js student@email supervisor@email`);
    }

    // Статистика по ИУП
    const totalIUPs = await IUP.countDocuments({ year: currentYear, isActive: true });
    console.log(`\n📊 Всего активных ИУП на ${currentYear} год: ${totalIUPs}`);

    // Группировка по статусам
    const statusStats = await IUP.aggregate([
      { $match: { year: currentYear, isActive: true } },
      { $group: { _id: '$overallStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log(`\n📈 Статистика по статусам:`);
    statusStats.forEach(stat => {
      console.log(`   ${stat._id}: ${stat.count}`);
    });

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Отключено от MongoDB');
  }
};

// Функция для создания ИУП конкретному студенту
const createIUPForStudent = async (studentEmail) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const student = await User.findOne({ 
      email: studentEmail, 
      role: 'magistrants' 
    }).populate('supervisor');

    if (!student) {
      console.log(`❌ Магистрант с email ${studentEmail} не найден`);
      return;
    }

    if (!student.supervisor) {
      console.log(`❌ У магистранта ${student.fullName} не назначен руководитель`);
      return;
    }

    const currentYear = new Date().getFullYear();
    const existingIUP = await IUP.findOne({
      student: student._id,
      year: currentYear,
      isActive: true
    });

    if (existingIUP) {
      console.log(`⚠️ У магистранта ${student.fullName} уже есть ИУП на ${currentYear} год`);
      return;
    }

    const newIUP = await IUP.createWithDefaultStages(
      student._id,
      student.supervisor._id,
      student.OP,
      student.language
    );

    console.log(`✅ ИУП успешно создан для ${student.fullName}`);
    console.log(`   ID ИУП: ${newIUP._id}`);
    console.log(`   Руководитель: ${student.supervisor.fullName}`);

  } catch (error) {
    console.error('❌ Ошибка создания ИУП:', error);
  } finally {
    await mongoose.disconnect();
  }
};

// Проверяем аргументы командной строки
const args = process.argv.slice(2);

if (args.length === 0) {
  // Создаем ИУП для всех магистрантов
  createMissingIUPs();
} else if (args.length === 1) {
  // Создаем ИУП для конкретного студента
  const [studentEmail] = args;
  createIUPForStudent(studentEmail);
} else {
  console.log(`
Использование:
  node createMissingIUPs.js                    - создать ИУП для всех магистрантов
  node createMissingIUPs.js student@email.com - создать ИУП для конкретного студента
  `);
}

export default { createMissingIUPs, createIUPForStudent };
