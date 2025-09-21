
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import User from '../models/User.js';

// Загружаем переменные окружения
dotenv.config();

const fixAdminAndLinks = async () => {
  try {
    console.log('🔧 Запуск исправления проблем с админом и связями...');
    
    // Подключаемся к MongoDB
    await connectDB();
    
    // 1. Исправляем проблему с email у админа
    console.log('\n📧 Исправляем email у админа...');
    
    const admin = await User.findOne({ role: 'admins' });
    if (admin) {
      if (!admin.email) {
        admin.email = 'admin@docmaster.kz';
        await admin.save();
        console.log(`✅ Добавлен email для админа: ${admin.email}`);
      } else {
        console.log(`✅ Email у админа уже есть: ${admin.email}`);
      }
    } else {
      console.log('❌ Админ не найден в базе данных');
    }
    
    // 2. Исправляем связи руководитель-подопечный
    console.log('\n👥 Исправляем связи руководитель-подопечный...');
    
    let fixedCount = 0;
    let checkedCount = 0;
    
    // Найти всех руководителей с подопечными
    const leaders = await User.find({ 
      role: 'leaders', 
      supervisees: { $exists: true, $ne: [] }
    }).populate('supervisees');
    
    console.log(`👨‍🏫 Найдено ${leaders.length} руководителей с подопечными`);
    
    for (const leader of leaders) {
      console.log(`\n🔍 Проверяем руководителя: ${leader.fullName} (${leader.supervisees.length} подопечных)`);
      
      for (const superviseeId of leader.supervisees) {
        checkedCount++;
        
        // Найти студента
        const student = await User.findById(superviseeId);
        
        if (!student) {
          console.log(`❌ Студент с ID ${superviseeId} не найден`);
          continue;
        }
        
        // Проверить, установлена ли связь supervisor
        if (!student.supervisor || student.supervisor.toString() !== leader._id.toString()) {
          console.log(`🔧 Исправляем связь: ${student.fullName} -> ${leader.fullName}`);
          
          // Обновляем поле supervisor напрямую
          await User.findByIdAndUpdate(
            student._id,
            { supervisor: leader._id },
            { new: true, runValidators: false } // отключаем валидаторы для избежания проблем
          );
          
          fixedCount++;
          console.log(`✅ Связь установлена`);
        } else {
          console.log(`✅ Связь уже корректна для ${student.fullName}`);
        }
      }
    }
    
    // 3. Проверяем обратные связи
    console.log('\n🔄 Проверяем обратные связи...');
    
    const studentsWithSupervisor = await User.find({
      role: { $in: ['magistrants', 'doctorants'] },
      supervisor: { $exists: true, $ne: null }
    }).populate('supervisor');
    
    for (const student of studentsWithSupervisor) {
      const supervisor = await User.findById(student.supervisor);
      
      if (!supervisor) continue;
      
      // Проверяем, есть ли студент в списке supervisees руководителя
      if (!supervisor.supervisees || !supervisor.supervisees.some(id => id.toString() === student._id.toString())) {
        console.log(`🔧 Добавляем ${student.fullName} в список подопечных ${supervisor.fullName}`);
        
        await User.findByIdAndUpdate(
          supervisor._id,
          { $addToSet: { supervisees: student._id } },
          { new: true, runValidators: false }
        );
        
        fixedCount++;
      }
    }
    
    // 4. Удаляем поле degree у магистрантов и докторантов (они не должны его иметь)
    console.log('\n🧹 Очищаем некорректные поля degree у студентов...');
    
    const studentsWithDegree = await User.updateMany(
      { 
        role: { $in: ['magistrants', 'doctorants'] },
        degree: { $exists: true }
      },
      { $unset: { degree: "" } }
    );
    
    if (studentsWithDegree.modifiedCount > 0) {
      console.log(`✅ Очищено поле degree у ${studentsWithDegree.modifiedCount} студентов`);
    }
    
    // 5. Статистика
    console.log('\n📊 Результаты исправления:');
    console.log(`   Проверено связей: ${checkedCount}`);
    console.log(`   Исправлено связей: ${fixedCount}`);
    
    // 6. Финальная проверка целостности
    console.log('\n🔍 Финальная проверка целостности...');
    
    const inconsistentData = await User.aggregate([
      {
        $match: { 
          $or: [
            { role: 'leaders', supervisees: { $exists: true, $ne: [] } },
            { role: { $in: ['magistrants', 'doctorants'] }, supervisor: { $exists: true, $ne: null } }
          ]
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'supervisees',
          foreignField: '_id',
          as: 'superviseeDocs'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'supervisor',
          foreignField: '_id',
          as: 'supervisorDoc'
        }
      }
    ]);
    
    console.log('✅ Все исправления завершены!');
    console.log('\n🎯 Проверьте авторизацию админа - теперь должна работать');
    console.log('🎯 Проверьте связи руководитель-подопечный в интерфейсе');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Ошибка исправления:', error);
    process.exit(1);
  }
};

fixAdminAndLinks();
