import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

// Загрузка переменных окружения
dotenv.config();

const checkUserSupervisors = async () => {
  try {
    // Подключение к MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Подключено к MongoDB');

    // Находим всех магистрантов
    const magistrants = await User.find({ 
      role: 'magistrants', 
      isActive: true 
    }).select('lastname firstname fathername supervisor OP language');

    console.log(`\n📊 Найдено магистрантов: ${magistrants.length}\n`);

    // Проверяем каждого магистранта
    for (const magistrant of magistrants) {
      const supervisorInfo = magistrant.supervisor 
        ? await User.findById(magistrant.supervisor).select('lastname firstname fathername')
        : null;

      console.log(`👨‍🎓 ${magistrant.lastname} ${magistrant.firstname}`);
      console.log(`   OP: ${magistrant.OP}`);
      console.log(`   Язык: ${magistrant.language}`);
      
      if (supervisorInfo) {
        console.log(`   ✅ Руководитель: ${supervisorInfo.lastname} ${supervisorInfo.firstname}`);
      } else {
        console.log(`   ❌ Руководитель НЕ НАЗНАЧЕН!`);
      }
      console.log('');
    }

    // Находим всех руководителей
    const leaders = await User.find({ 
      role: 'leaders', 
      isActive: true 
    }).select('lastname firstname fathername supervisees')
      .populate('supervisees', 'lastname firstname fathername');

    console.log(`\n📊 Найдено руководителей: ${leaders.length}\n`);

    for (const leader of leaders) {
      console.log(`👨‍🏫 ${leader.lastname} ${leader.firstname}`);
      console.log(`   Подопечных: ${leader.supervisees?.length || 0}`);
      
      if (leader.supervisees && leader.supervisees.length > 0) {
        leader.supervisees.forEach(supervisee => {
          console.log(`     - ${supervisee.lastname} ${supervisee.firstname}`);
        });
      }
      console.log('');
    }

    // Найдем магистрантов без руководителей
    const magistrantsWithoutSupervisors = await User.find({
      role: 'magistrants',
      isActive: true,
      $or: [
        { supervisor: { $exists: false } },
        { supervisor: null }
      ]
    }).select('lastname firstname fathername OP language');

    if (magistrantsWithoutSupervisors.length > 0) {
      console.log(`\n🚨 МАГИСТРАНТЫ БЕЗ РУКОВОДИТЕЛЕЙ (${magistrantsWithoutSupervisors.length}):\n`);
      magistrantsWithoutSupervisors.forEach(student => {
        console.log(`❌ ${student.lastname} ${student.firstname} (${student.OP})`);
      });
      console.log('\n💡 Эти студенты не смогут создать ИУП!');
    } else {
      console.log('\n✅ Все магистранты имеют назначенных руководителей');
    }

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Отключено от MongoDB');
  }
};

// Функция для назначения руководителя магистранту
const assignSupervisor = async (studentEmail, supervisorEmail) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const student = await User.findOne({ email: studentEmail, role: 'magistrants' });
    const supervisor = await User.findOne({ email: supervisorEmail, role: 'leaders' });

    if (!student) {
      console.log(`❌ Магистрант с email ${studentEmail} не найден`);
      return;
    }

    if (!supervisor) {
      console.log(`❌ Руководитель с email ${supervisorEmail} не найден`);
      return;
    }

    // Назначаем руководителя студенту
    student.supervisor = supervisor._id;
    await student.save();

    // Добавляем студента в список подопечных руководителя
    if (!supervisor.supervisees.includes(student._id)) {
      supervisor.supervisees.push(student._id);
      await supervisor.save();
    }

    console.log(`✅ Успешно назначен руководитель:`);
    console.log(`   Студент: ${student.fullName}`);
    console.log(`   Руководитель: ${supervisor.fullName}`);

  } catch (error) {
    console.error('❌ Ошибка назначения руководителя:', error);
  } finally {
    await mongoose.disconnect();
  }
};

// Проверяем аргументы командной строки
const args = process.argv.slice(2);

if (args.length === 0) {
  // Запуск проверки
  checkUserSupervisors();
} else if (args.length === 2) {
  // Назначение руководителя: node checkUserSupervisors.js student@email.com supervisor@email.com
  const [studentEmail, supervisorEmail] = args;
  assignSupervisor(studentEmail, supervisorEmail);
} else {
  console.log(`
Использование:
  node checkUserSupervisors.js                           - проверить назначения руководителей
  node checkUserSupervisors.js student@email supervisor@email - назначить руководителя
  `);
}

export default { checkUserSupervisors, assignSupervisor };
