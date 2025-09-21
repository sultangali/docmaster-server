import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import User from '../models/User.js';
import { ObjectId } from 'mongodb';

// Загружаем переменные окружения
dotenv.config();

const forceSyncLinks = async () => {
  try {
    console.log('🔧 Принудительная синхронизация связей...');
    
    // Подключаемся к MongoDB
    await connectDB();
    
    // Находим конкретного руководителя из примера
    const leaderId = '68c88186c3d5b361016f3b32';
    const studentId = '68c8815dc3d5b361016f3b1e';
    
    console.log('\n🎯 Исправляем конкретную проблемную связь...');
    console.log(`Руководитель ID: ${leaderId}`);
    console.log(`Студент ID: ${studentId}`);
    
    // Получаем данные из базы
    const leader = await User.findById(leaderId);
    const student = await User.findById(studentId);
    
    if (!leader) {
      console.log('❌ Руководитель не найден');
      return;
    }
    
    if (!student) {
      console.log('❌ Студент не найден');
      return;
    }
    
    console.log(`\n📋 Текущее состояние:`);
    console.log(`Руководитель: ${leader.fullName}`);
    console.log(`Студент: ${student.fullName}`);
    console.log(`Студент в списке supervisees: ${leader.supervisees?.includes(studentId)}`);
    console.log(`Supervisor у студента: ${student.supervisor || 'null'}`);
    
    // Принудительно устанавливаем связь
    console.log('\n🔨 Принудительно устанавливаем связь...');
    
    // Метод 1: Прямое обновление в базе данных
    const updateResult = await User.updateOne(
      { _id: new ObjectId(studentId) },
      { $set: { supervisor: new ObjectId(leaderId) } }
    );
    
    console.log(`Обновление выполнено. Затронуто документов: ${updateResult.modifiedCount}`);
    
    // Проверяем результат
    const updatedStudent = await User.findById(studentId);
    console.log(`\n✅ Проверка после обновления:`);
    console.log(`Supervisor у студента: ${updatedStudent.supervisor}`);
    console.log(`Связь установлена: ${updatedStudent.supervisor?.toString() === leaderId}`);
    
    // Теперь обрабатываем всех остальных
    console.log('\n🔄 Обрабатываем всех руководителей...');
    
    const allLeaders = await User.find({ 
      role: 'leaders', 
      supervisees: { $exists: true, $ne: [] }
    });
    
    let totalFixed = 0;
    
    for (const currentLeader of allLeaders) {
      console.log(`\n👨‍🏫 Обрабатываем ${currentLeader.fullName}`);
      
      if (!currentLeader.supervisees || currentLeader.supervisees.length === 0) {
        console.log('  Нет подопечных');
        continue;
      }
      
      for (const superviseId of currentLeader.supervisees) {
        console.log(`  📝 Проверяем студента ${superviseId}`);
        
        // Получаем данные студента
        const currentStudent = await User.findById(superviseId);
        if (!currentStudent) {
          console.log(`    ❌ Студент не найден`);
          continue;
        }
        
        // Проверяем связь
        const hasCorrectSupervisor = currentStudent.supervisor && 
          currentStudent.supervisor.toString() === currentLeader._id.toString();
        
        if (!hasCorrectSupervisor) {
          console.log(`    🔧 Исправляем связь для ${currentStudent.fullName}`);
          
          // Принудительно устанавливаем связь
          await User.updateOne(
            { _id: superviseId },
            { $set: { supervisor: currentLeader._id } }
          );
          
          totalFixed++;
          console.log(`    ✅ Связь установлена`);
        } else {
          console.log(`    ✅ Связь уже корректна`);
        }
      }
    }
    
    console.log(`\n📊 Итоги:`);
    console.log(`Исправлено связей: ${totalFixed}`);
    
    // Финальная проверка проблемной связи
    console.log('\n🔍 Финальная проверка проблемной связи...');
    const finalStudent = await User.findById(studentId);
    const finalLeader = await User.findById(leaderId);
    
    console.log(`Студент: ${finalStudent.fullName}`);
    console.log(`Supervisor: ${finalStudent.supervisor}`);
    console.log(`Руководитель: ${finalLeader.fullName}`);
    console.log(`Студент в supervisees: ${finalLeader.supervisees?.map(id => id.toString()).includes(studentId)}`);
    console.log(`Связь корректна: ${finalStudent.supervisor?.toString() === leaderId}`);
    
    if (finalStudent.supervisor?.toString() === leaderId) {
      console.log('\n🎉 Проблема решена!');
    } else {
      console.log('\n⚠️ Проблема НЕ решена. Требуется дополнительная диагностика.');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
};

forceSyncLinks();
