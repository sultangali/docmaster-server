import express from 'express';
import IUP from '../models/IUP.js';
import User from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Все роуты требуют авторизации
router.use(authenticate);

// @route   GET /api/iup
// @desc    Получить ИУП текущего пользователя или список ИУП для руководителей/админов
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { year = new Date().getFullYear(), studentId, status, educationProgram, language } = req.query;
    let query = { isActive: true };

    if (req.user.role === 'magistrants') {
      // Магистрант видит только свой ИУП
      query.student = req.user._id;
      query.year = parseInt(year);
      
      let iup = await IUP.findOne(query)
        .populate('student', 'lastname firstname fathername fullName OP language')
        .populate('supervisor', 'lastname firstname fathername fullName degree');

      // Если ИУП не существует, создаем его
      if (!iup) {
        const supervisor = await User.findById(req.user.supervisor);
        if (!supervisor) {
          return res.status(400).json({
            success: false,
            message: 'У вас не назначен руководитель. Обратитесь к администратору.'
          });
        }

        try {
          iup = await IUP.createWithDefaultStages(
            req.user._id,
            req.user.supervisor,
            req.user.OP,
            req.user.language
          );

          iup = await IUP.findById(iup._id)
            .populate('student', 'lastname firstname fathername fullName OP language')
            .populate('supervisor', 'lastname firstname fathername fullName degree');
        } catch (error) {
          // Если ошибка дублирования (E11000), значит ИУП уже создан другим запросом
          if (error.code === 11000) {
            console.log('ИУП уже существует, получаем существующий...');
            iup = await IUP.findOne(query)
              .populate('student', 'lastname firstname fathername fullName OP language')
              .populate('supervisor', 'lastname firstname fathername fullName degree');
          } else {
            // Для других ошибок пробрасываем исключение
            throw error;
          }
        }
      }

      return res.status(200).json({
        success: true,
        data: { iup }
      });

    } else if (req.user.role === 'leaders') {
      // Руководитель видит ИУП своих подопечных
      const supervisees = req.user.supervisees || [];
      
      if (studentId && supervisees.includes(studentId)) {
        query.student = studentId;
      } else {
        query.student = { $in: supervisees };
      }
      
      if (year) query.year = parseInt(year);

      const iups = await IUP.find(query)
        .populate('student', 'lastname firstname fathername fullName OP language')
        .populate('supervisor', 'lastname firstname fathername fullName degree')
        .sort({ 'student.lastname': 1 });

      return res.status(200).json({
        success: true,
        data: { iups }
      });

    } else if (req.user.role === 'admins') {
      // Админ видит все ИУП с возможностью фильтрации
      if (studentId) query.student = studentId;
      if (status) query.overallStatus = status;
      if (educationProgram) query['metadata.educationProgram'] = educationProgram;
      if (language) query['metadata.language'] = language;
      if (year) query.year = parseInt(year);

      const iups = await IUP.find(query)
        .populate('student', 'lastname firstname fathername fullName OP language')
        .populate('supervisor', 'lastname firstname fathername fullName degree')
        .sort({ 'student.lastname': 1 });

      return res.status(200).json({
        success: true,
        data: { iups }
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Нет доступа к ИУП'
    });

  } catch (error) {
    console.error('Get IUP error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения ИУП'
    });
  }
});

// @route   GET /api/iup/stats/dashboard
// @desc    Получить статистику ИУП для дашборда
// @access  Private (Admins only)
router.get('/stats/dashboard', authorize('admins'), async (req, res) => {
  try {
    const { year = new Date().getFullYear(), educationProgram, language } = req.query;
    
    let filters = { year: parseInt(year) };
    if (educationProgram) filters['metadata.educationProgram'] = educationProgram;
    if (language) filters['metadata.language'] = language;

    const stats = await IUP.getStatistics(filters);

    // Дополнительная статистика
    const totalIups = await IUP.countDocuments({ isActive: true, ...filters });
    const byEducationProgram = await IUP.aggregate([
      { $match: { isActive: true, ...filters } },
      { $group: { _id: '$metadata.educationProgram', count: { $sum: 1 } } }
    ]);
    const byLanguage = await IUP.aggregate([
      { $match: { isActive: true, ...filters } },
      { $group: { _id: '$metadata.language', count: { $sum: 1 } } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        statusStatistics: stats,
        total: totalIups,
        byEducationProgram,
        byLanguage
      }
    });

  } catch (error) {
    console.error('Get IUP dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения статистики ИУП'
    });
  }
});

// @route   GET /api/iup/test-no-auth
// @desc    Тестовый роут БЕЗ авторизации для диагностики
// @access  Public
router.get('/test-no-auth', async (req, res) => {
  try {
    console.log('🧪 Test route (no auth) called');
    res.status(200).json({
      success: true,
      message: 'Test route without auth works',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test route error:', error);
    res.status(500).json({ success: false, message: 'Test route error' });
  }
});

// @route   GET /api/iup/supervisees-test
// @desc    Тестовый роут для проверки работы без авторизации
// @access  Private
router.get('/supervisees-test', authenticate, async (req, res) => {
  try {
    console.log('🧪 Test route called by user:', req.user.fullName, req.user.role);
    res.status(200).json({
      success: true,
      message: 'Test route works',
      user: {
        id: req.user._id,
        fullName: req.user.fullName,
        role: req.user.role,
        supervisees: req.user.supervisees
      }
    });
  } catch (error) {
    console.error('Test route error:', error);
    res.status(500).json({ success: false, message: 'Test route error' });
  }
});

// @route   GET /api/iup/supervisees
// @desc    Получить список подопечных с их ИУП для руководителя
// @access  Private (Leaders only)
router.get('/supervisees', authorize('leaders'), async (req, res) => {
  try {
    console.log('🔍 Supervisees route called by user:', {
      userId: req.user._id,
      role: req.user.role,
      fullName: req.user.fullName,
      supervisees: req.user.supervisees
    });

    const { year = new Date().getFullYear() } = req.query;
    const supervisees = req.user.supervisees || [];

    console.log(`👥 Found ${supervisees.length} supervisees for user ${req.user.fullName}`);

    if (supervisees.length === 0) {
      console.log('⚠️ No supervisees found, returning empty array');
      return res.status(200).json({
        success: true,
        data: { supervisees: [] }
      });
    }

    // Получаем информацию о подопечных с их ИУП
    const superviseesWithIup = await User.find({ 
      _id: { $in: supervisees }, 
      isActive: true 
    })
    .select('lastname firstname fathername fullName OP language whatsapp email')
    .lean();

    // Получаем ИУП для каждого подопечного
    for (const supervisee of superviseesWithIup) {
      const iup = await IUP.findOne({
        student: supervisee._id,
        year: parseInt(year),
        isActive: true
      }).select('currentStage overallStatus stages metadata');

      supervisee.iup = iup;
      supervisee.hasIup = !!iup;
      if (iup) {
        supervisee.progress = iup.progress;
        supervisee.currentStageTitle = iup.currentStageData?.title || 'Не определен';
        supervisee.stagesRequiringAttention = iup.stages.filter(s => 
          s.status === 'submitted' || s.status === 'supervisor_review'
        ).length;
      }
    }

    res.status(200).json({
      success: true,
      data: { supervisees: superviseesWithIup }
    });

  } catch (error) {
    console.error('Get supervisees error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения списка подопечных'
    });
  }
});

// @route   GET /api/iup/:id
// @desc    Получить конкретный ИУП по ID
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const iup = await IUP.findById(req.params.id)
      .populate('student', 'lastname firstname fathername fullName OP language')
      .populate('supervisor', 'lastname firstname fathername fullName degree')
      .populate('stages.statusHistory.changedBy', 'lastname firstname fathername fullName')
      .populate('stages.supervisorEdits.editedBy', 'lastname firstname fathername fullName');

    if (!iup) {
      return res.status(404).json({
        success: false,
        message: 'ИУП не найден'
      });
    }

    // Проверяем права доступа
    const hasAccess = 
      req.user.role === 'admins' ||
      (req.user.role === 'magistrants' && iup.student._id.toString() === req.user._id.toString()) ||
      (req.user.role === 'leaders' && iup.supervisor && iup.supervisor._id.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Нет доступа к этому ИУП'
      });
    }

    res.status(200).json({
      success: true,
      data: { iup }
    });

  } catch (error) {
    console.error('Get IUP by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения ИУП'
    });
  }
});

// @route   PUT /api/iup/:id/stage/:stageNumber
// @desc    Обновить данные этапа
// @access  Private
router.put('/:id/stage/:stageNumber', async (req, res) => {
  try {
    const { stageNumber } = req.params;
    const { studentData, supervisorEdits, status, comment } = req.body;

    const iup = await IUP.findById(req.params.id);
    if (!iup) {
      return res.status(404).json({
        success: false,
        message: 'ИУП не найден'
      });
    }

    const stage = iup.stages.find(s => s.stageNumber === parseInt(stageNumber));
    if (!stage) {
      return res.status(404).json({
        success: false,
        message: 'Этап не найден'
      });
    }

    // Проверяем права доступа
    const isStudent = req.user.role === 'magistrants' && iup.student.toString() === req.user._id.toString();
    const isSupervisor = req.user.role === 'leaders' && iup.supervisor && iup.supervisor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admins';

    if (!isStudent && !isSupervisor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Нет доступа к этому ИУП'
      });
    }

    // Магистрант может редактировать только свои данные
    if (isStudent && studentData) {
      // Обновляем данные студента
      if (studentData.dissertationTopic) {
        stage.studentData.dissertationTopic = {
          ...stage.studentData.dissertationTopic,
          ...studentData.dissertationTopic
        };
      }
      if (studentData.textData !== undefined) {
        stage.studentData.textData = studentData.textData;
      }
      if (studentData.additionalData) {
        stage.studentData.additionalData = {
          ...stage.studentData.additionalData,
          ...studentData.additionalData
        };
      }

      // Автоматически меняем статус на "в процессе", если было "не начато"
      if (stage.status === 'not_started') {
        stage.status = 'in_progress';
        stage.statusHistory.push({
          status: 'in_progress',
          changedBy: req.user._id,
          changedAt: new Date(),
          comment: 'Начато заполнение данных'
        });
      }
    }

    // Руководитель может редактировать данные студента и добавлять свои правки
    if (isSupervisor) {
      if (supervisorEdits) {
        if (supervisorEdits.dissertationTopic) {
          stage.supervisorEdits.dissertationTopic = {
            ...stage.supervisorEdits.dissertationTopic,
            ...supervisorEdits.dissertationTopic
          };
        }
        if (supervisorEdits.textData !== undefined) {
          stage.supervisorEdits.textData = supervisorEdits.textData;
        }
        if (supervisorEdits.comments !== undefined) {
          stage.supervisorEdits.comments = supervisorEdits.comments;
        }
        
        stage.supervisorEdits.editedAt = new Date();
        stage.supervisorEdits.editedBy = req.user._id;
      }

      // Руководитель также может обновлять данные студента напрямую
      if (studentData) {
        if (studentData.dissertationTopic) {
          stage.studentData.dissertationTopic = {
            ...stage.studentData.dissertationTopic,
            ...studentData.dissertationTopic
          };
        }
        if (studentData.textData !== undefined) {
          stage.studentData.textData = studentData.textData;
        }
        if (studentData.additionalData) {
          stage.studentData.additionalData = {
            ...stage.studentData.additionalData,
            ...studentData.additionalData
          };
        }
      }
    }

    // Обновление статуса (для всех ролей с соответствующими правами)
    if (status && status !== stage.status) {
      // Проверяем допустимые переходы статусов
      const allowedTransitions = {
        'magistrants': {
          'in_progress': ['submitted'],
          'rejected': ['in_progress', 'submitted']
        },
        'leaders': {
          'submitted': ['supervisor_review', 'supervisor_approved', 'rejected'],
          'supervisor_review': ['supervisor_approved', 'rejected'],
          'in_progress': ['supervisor_review', 'supervisor_approved']
        },
        'admins': {
          'supervisor_approved': ['admin_review', 'admin_approved'],
          'admin_review': ['admin_approved', 'rejected'],
          'submitted': ['admin_review', 'admin_approved'], // Если не требует одобрения руководителя
          'any': ['rejected'] // Админ может отклонить любой статус
        }
      };

      const userAllowedTransitions = allowedTransitions[req.user.role];
      const canTransition = 
        (userAllowedTransitions && userAllowedTransitions[stage.status] && userAllowedTransitions[stage.status].includes(status)) ||
        (req.user.role === 'admins' && status === 'rejected');

      if (canTransition) {
        // Если руководитель одобрил этап - сразу переводим на рассмотрение админу для финального контроля
        if (status === 'supervisor_approved') {
          await iup.updateStageStatus(parseInt(stageNumber), 'admin_review', req.user._id, 
            comment ? `Одобрено руководителем. ${comment}` : 'Одобрено руководителем и отправлено ответственному по магистратуре для окончательного утверждения');
        } else {
          await iup.updateStageStatus(parseInt(stageNumber), status, req.user._id, comment);
        }
        
        // Если этап завершен, переходим к следующему этапу
        // Статус 'supervisor_approved' автоматически становится 'admin_review'
        const finalStatus = status === 'supervisor_approved' ? 'admin_review' : status;
        const isStageCompleted = (finalStatus === 'admin_approved');
        
        if (isStageCompleted && parseInt(stageNumber) === iup.currentStage) {
          await iup.moveToNextStage();
        }
      } else {
        return res.status(400).json({
          success: false,
          message: `Недопустимый переход статуса с "${stage.status}" на "${status}"`
        });
      }
    } else {
      // Просто сохраняем изменения без смены статуса
      await iup.save();
    }

    // Получаем обновленный ИУП (перезагружаем из БД для корректности данных)
    await iup.save(); // Убеждаемся что все изменения сохранены
    const updatedIup = await IUP.findById(req.params.id)
      .populate('student', 'lastname firstname fathername fullName OP language')
      .populate('supervisor', 'lastname firstname fathername fullName degree')
      .populate('stages.statusHistory.changedBy', 'lastname firstname fathername fullName')
      .populate('stages.supervisorEdits.editedBy', 'lastname firstname fathername fullName');

    res.status(200).json({
      success: true,
      message: 'Этап успешно обновлен',
      data: { iup: updatedIup }
    });

  } catch (error) {
    console.error('Update IUP stage error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка обновления этапа ИУП'
    });
  }
});

// @route   POST /api/iup/:id/stage/:stageNumber/submit
// @desc    Отправить этап на проверку
// @access  Private (Students only)
router.post('/:id/stage/:stageNumber/submit', async (req, res) => {
  try {
    const { stageNumber } = req.params;

    const iup = await IUP.findById(req.params.id);
    if (!iup) {
      return res.status(404).json({
        success: false,
        message: 'ИУП не найден'
      });
    }

    // Только магистрант может отправлять на проверку
    if (req.user.role !== 'magistrants' || iup.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Только магистрант может отправлять этапы на проверку'
      });
    }

    const stage = iup.stages.find(s => s.stageNumber === parseInt(stageNumber));
    if (!stage) {
      return res.status(404).json({
        success: false,
        message: 'Этап не найден'
      });
    }

    // Проверяем, что этап можно отправить
    if (!['in_progress', 'rejected'].includes(stage.status)) {
      return res.status(400).json({
        success: false,
        message: 'Этап нельзя отправить на проверку в текущем статусе'
      });
    }

    // Для первого этапа проверяем, что заполнены темы на всех языках
    if (stage.stageType === 'dissertation_topic') {
      const topic = stage.studentData.dissertationTopic;
      if (!topic || !topic.kazakh || !topic.russian || !topic.english) {
        return res.status(400).json({
          success: false,
          message: 'Необходимо заполнить тему диссертации на всех трех языках'
        });
      }
    }

    await iup.updateStageStatus(parseInt(stageNumber), 'submitted', req.user._id, 'Отправлено на проверку');

    const updatedIup = await IUP.findById(req.params.id)
      .populate('student', 'lastname firstname fathername fullName OP language')
      .populate('supervisor', 'lastname firstname fathername fullName degree');

    res.status(200).json({
      success: true,
      message: 'Этап отправлен на проверку',
      data: { iup: updatedIup }
    });

  } catch (error) {
    console.error('Submit IUP stage error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка отправки этапа на проверку'
    });
  }
});

export default router;
