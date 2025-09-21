import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import User from '../models/User.js';

// Загружаем переменные окружения
dotenv.config();

const fixSupervisorLinks = async () => {
  try {
    console.log('🔧 Запуск исправления связей руководитель-подопечный...');
    
    // Подключаемся к MongoDB
    await connectDB();
    
    let fixedCount = 0;
    let checkedCount = 0;
    
    // 1. Найти всех руководителей с подопечными
    const leaders = await User.find({ 
      role: 'leaders', 
      supervisees: { $exists: true, $ne: [] }
    }).populate('supervisees');
    
    console.log(`👥 Найдено ${leaders.length} руководителей с подопечными`);
    
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
          console.log(`🔧 Исправляем связь для ${student.fullName} -> ${leader.fullName}`);
          
          // Обновляем поле supervisor
          await User.findByIdAndUpdate(
            student._id,
            { supervisor: leader._id },
            { new: true }
          );
          
          fixedCount++;
        } else {
          console.log(`✅ Связь уже корректна для ${student.fullName}`);
        }
      }
    }
    
    // 2. Проверяем обратные связи - студенты с supervisor, но без записи в supervisees
    console.log('\n🔄 Проверяем обратные связи...');
    
    const studentsWithSupervisor = await User.find({
      role: { $in: ['magistrants', 'doctorants'] },
      supervisor: { $exists: true, $ne: null }
    }).populate('supervisor');
    
    for (const student of studentsWithSupervisor) {
      const supervisor = student.supervisor;
      
      if (!supervisor) continue;
      
      // Проверяем, есть ли студент в списке supervisees руководителя
      if (!supervisor.supervisees || !supervisor.supervisees.includes(student._id)) {
        console.log(`🔧 Добавляем ${student.fullName} в список подопечных ${supervisor.fullName}`);
        
        await User.findByIdAndUpdate(
          supervisor._id,
          { $addToSet: { supervisees: student._id } },
          { new: true }
        );
        
        fixedCount++;
      }
    }
    
    // 3. Статистика
    console.log('\n📊 Результаты исправления:');
    console.log(`   Проверено связей: ${checkedCount}`);
    console.log(`   Исправлено связей: ${fixedCount}`);
    
    // 4. Финальная проверка
    const inconsistentLeaders = await User.aggregate([
      { $match: { role: 'leaders', supervisees: { $exists: true, $ne: [] } } },
      {
        $lookup: {
          from: 'users',
          localField: 'supervisees',
          foreignField: '_id',
          as: 'superviseeDocs'
        }
      },
      {
        $addFields: {
          inconsistentSupervisees: {
            $filter: {
              input: '$superviseeDocs',
              cond: { $ne: ['$$this.supervisor', '$_id'] }
            }
          }
        }
      },
      { $match: { 'inconsistentSupervisees.0': { $exists: true } } }
    ]);
    
    if (inconsistentLeaders.length === 0) {
      console.log('✅ Все связи теперь согласованы!');
    } else {
      console.log(`⚠️ Остались несогласованные связи у ${inconsistentLeaders.length} руководителей`);
    }
    
    console.log('\n🎉 Исправление завершено!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Ошибка исправления связей:', error);
    process.exit(1);
  }
};

fixSupervisorLinks();
