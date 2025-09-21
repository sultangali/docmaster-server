import express from 'express';
import User from '../models/User.js';
import IUP from '../models/IUP.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Все роуты требуют авторизации
router.use(authenticate);

// @route   GET /api/users
// @desc    Получить список пользователей (для админов - все, для остальных - только своего типа)
// @access  Private
router.get('/', async (req, res) => {
  try {
    let query = { isActive: true };
    
    // Если не админ, показываем только пользователей его роли
    if (req.user.role !== 'admins') {
      query.role = req.user.role;
    }

    const { role, page = 1, limit = 10, search } = req.query;
    
    // Фильтр по роли (если указан)
    if (role && req.user.role === 'admins') {
      query.role = role;
    }
    
    // Поиск по имени/фамилии
    if (search) {
      query.$or = [
        { firstname: { $regex: search, $options: 'i' } },
        { lastname: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('-__v')
      .populate('createdBy', 'lastname firstname username')
      .populate('supervisor', 'lastname firstname fathername fullName degree language whatsapp email')
      .populate('supervisees', 'lastname firstname fathername fullName role OP language whatsapp email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          current: parseInt(page),
          pageSize: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
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

// @route   GET /api/users/by-role/:role
// @desc    Получить пользователей по роли
// @access  Private (Admins and leaders for students)
router.get('/by-role/:role', async (req, res) => {
  try {
    const { role } = req.params;
    
    if (!['magistrants', 'doctorants', 'leaders', 'admins'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Неверная роль'
      });
    }

    // Проверяем права доступа
    if (req.user.role !== 'admins') {
      // Руководители могут получать только списки студентов
      if (req.user.role === 'leaders' && !['magistrants', 'doctorants'].includes(role)) {
        return res.status(403).json({
          success: false,
          message: 'Нет прав для просмотра пользователей этой роли'
        });
      }
      // Остальные роли могут смотреть только свою роль (если нужно)
      else if (req.user.role !== 'leaders' && req.user.role !== role) {
        return res.status(403).json({
          success: false,
          message: 'Нет прав для просмотра пользователей этой роли'
        });
      }
    }

    const users = await User.getByRole(role);

    res.status(200).json({
      success: true,
      data: users,
      total: users.length
    });

  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения пользователей по роли'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Получить пользователя по ID
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('createdBy', 'lastname firstname username');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Проверяем права: админы видят всех, остальные только себя
    if (req.user.role !== 'admins' && req.user._id.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Нет прав для просмотра этого пользователя'
      });
    }

    res.status(200).json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения пользователя'
    });
  }
});

// @route   POST /api/users
// @desc    Создать нового пользователя
// @access  Private (Admins only)
router.post('/', authorize('admins'), async (req, res) => {
  try {
    const userData = {
      ...req.body,
      createdBy: req.user._id
    };

    // Если создаем админа, требуем пароль
    if (userData.role === 'admins' && !userData.password) {
      return res.status(400).json({
        success: false,
        message: 'Для администратора обязательно указание пароля'
      });
    }

    const user = new User(userData);
    await user.save();

    // Автоматически создаем ИУП для магистрантов, если у них есть руководитель
    let iupCreated = false;
    if (user.role === 'magistrants' && user.supervisor) {
      try {
        await IUP.createWithDefaultStages(
          user._id,
          user.supervisor,
          user.OP,
          user.language
        );
        iupCreated = true;
        console.log(`✅ Автоматически создан ИУП для магистранта ${user.fullName}`);
      } catch (iupError) {
        if (iupError.code === 11000) {
          // ИУП уже существует - это нормально
          iupCreated = true;
          console.log(`ℹ️ ИУП уже существует для магистранта ${user.fullName}`);
        } else {
          console.error('❌ Ошибка создания ИУП для нового магистранта:', iupError);
          // Не прерываем создание пользователя, только логируем ошибку
        }
      }
    }

    // Получаем созданного пользователя с populate
    const createdUser = await User.findById(user._id)
      .populate('createdBy', 'lastname firstname username')
      .populate('supervisor', 'lastname firstname fathername fullName');

    const response = {
      success: true,
      message: 'Пользователь успешно создан',
      data: { user: createdUser }
    };

    // Добавляем информацию о создании ИУП в ответ
    if (user.role === 'magistrants') {
      if (iupCreated) {
        response.message += '. ИУП автоматически создан.';
        response.iupCreated = true;
      } else if (!user.supervisor) {
        response.message += '. ИУП будет создан после назначения руководителя.';
        response.iupCreated = false;
        response.reason = 'Нет назначенного руководителя';
      } else {
        response.message += '. ИУП не удалось создать автоматически.';
        response.iupCreated = false;
        response.reason = 'Ошибка создания ИУП';
      }
    }

    res.status(201).json(response);

  } catch (error) {
    console.error('Create user error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: messages
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Пользователь с таким именем уже существует'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Ошибка создания пользователя'
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Обновить пользователя
// @access  Private (Admins can update anyone, users can update themselves)
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Проверяем права: админы могут редактировать всех, остальные только себя
    if (req.user.role !== 'admins' && req.user._id.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Нет прав для редактирования этого пользователя'
      });
    }

    // Ограничиваем поля, которые может редактировать обычный пользователь
    let allowedFields = req.body;
    if (req.user.role !== 'admins') {
      // Разрешаем обычным пользователям редактировать основные поля профиля
      allowedFields = {
        firstname: req.body.firstname,
        lastname: req.body.lastname,
        fathername: req.body.fathername,
        email: req.body.email,
        whatsapp: req.body.whatsapp,
        language: req.body.language,
        ...(req.user.role === 'leaders' && req.body.degree && { degree: req.body.degree }),
        ...(req.user.role === 'leaders' && req.body.supervisees !== undefined && { supervisees: req.body.supervisees }),
        ...((['magistrants', 'doctorants'].includes(req.user.role)) && req.body.OP && { OP: req.body.OP })
      };
    } else if (allowedFields.role === 'admins' && allowedFields.password) {
      // Админы могут обновлять пароли других админов
      // Пароль будет автоматически хэширован в pre-save middleware
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      allowedFields,
      { new: true, runValidators: true }
    ).populate('createdBy', 'lastname firstname username');

    // КРИТИЧЕСКИ ВАЖНО: Синхронизируем связи после обновления
    console.log(`🔄 Синхронизируем связи для пользователя ${updatedUser.fullName} (${updatedUser.role})`);
    
    // Если обновляется руководитель с подопечными
    if (updatedUser.role === 'leaders') {
      // Если в запросе есть массив supervisees, обновляем связи
      if (req.body.supervisees !== undefined) {
        const newSupervisees = req.body.supervisees || [];
        const currentSupervisees = user.supervisees?.map(id => id.toString()) || [];
        
        console.log(`📝 Обновляем список подопечных: было ${currentSupervisees.length}, стало ${newSupervisees.length}`);
        
        // Находим добавленных и удаленных студентов
        const toAdd = newSupervisees.filter(id => !currentSupervisees.includes(id.toString()));
        const toRemove = currentSupervisees.filter(id => !newSupervisees.includes(id));
        
        // Убираем данного руководителя у студентов, которые больше не под его руководством
        if (toRemove.length > 0) {
          await User.updateMany(
            { _id: { $in: toRemove } },
            { $unset: { supervisor: 1 } }
          );
          console.log(`➖ Удален supervisor у ${toRemove.length} студентов`);
        }
        
        // Устанавливаем данного руководителя у новых подопечных
        if (toAdd.length > 0) {
          await User.updateMany(
            { _id: { $in: toAdd } },
            { supervisor: updatedUser._id }
          );
          console.log(`➕ Установлен supervisor у ${toAdd.length} новых студентов`);
          
          // Автоматически создаем ИУП для новых магистрантов
          for (const studentId of toAdd) {
            try {
              const student = await User.findById(studentId);
              if (student && student.role === 'magistrants') {
                // Проверяем, есть ли уже ИУП
                const existingIUP = await IUP.findOne({ 
                  student: studentId, 
                  year: new Date().getFullYear(),
                  isActive: true 
                });
                
                if (!existingIUP) {
                  await IUP.createWithDefaultStages(
                    studentId,
                    updatedUser._id,
                    student.OP,
                    student.language
                  );
                  console.log(`🎯 Автоматически создан ИУП для нового подопечного ${student.fullName}`);
                }
              }
            } catch (iupError) {
              if (iupError.code === 11000) {
                // ИУП уже существует - это нормально
                console.log(`ℹ️ ИУП уже существует для студента ${studentId}`);
              } else {
                console.error(`❌ Ошибка создания ИУП для студента ${studentId}:`, iupError);
              }
            }
          }
        }
        
        // Обновляем список supervisees у руководителя
        await User.findByIdAndUpdate(
          updatedUser._id,
          { supervisees: newSupervisees }
        );
      } else if (updatedUser.supervisees && updatedUser.supervisees.length > 0) {
        // Старая логика - устанавливаем supervisor у всех подопечных
        console.log(`📝 Обновляем supervisor у ${updatedUser.supervisees.length} подопечных`);
        
        const syncResult = await User.updateMany(
          { _id: { $in: updatedUser.supervisees } },
          { supervisor: updatedUser._id }
        );
        
        console.log(`✅ Обновлено supervisor у ${syncResult.modifiedCount} студентов`);
      }
    }
    
    // Если обновляется студент с новым руководителем
    if (['magistrants', 'doctorants'].includes(updatedUser.role) && updatedUser.supervisor) {
      console.log(`📝 Добавляем студента в список подопечных руководителя`);
      
      // Добавляем студента в список подопечных руководителя
      await User.findByIdAndUpdate(
        updatedUser.supervisor,
        { $addToSet: { supervisees: updatedUser._id } }
      );
      
      console.log(`✅ Студент добавлен в список подопечных`);
      
      // Автоматически создаем ИУП для магистранта, если его еще нет
      if (updatedUser.role === 'magistrants') {
        try {
          // Проверяем, есть ли уже ИУП у этого магистранта
          const existingIUP = await IUP.findOne({ 
            student: updatedUser._id, 
            year: new Date().getFullYear(),
            isActive: true 
          });
          
          if (!existingIUP) {
            await IUP.createWithDefaultStages(
              updatedUser._id,
              updatedUser.supervisor,
              updatedUser.OP,
              updatedUser.language
            );
            console.log(`🎯 Автоматически создан ИУП для магистранта ${updatedUser.fullName} после назначения руководителя`);
          } else {
            console.log(`ℹ️ ИУП уже существует для магистранта ${updatedUser.fullName}`);
          }
        } catch (iupError) {
          if (iupError.code === 11000) {
            // ИУП уже существует - это нормально
            console.log(`ℹ️ ИУП уже существует для магистранта ${updatedUser.fullName} (обнаружено при создании)`);
          } else {
            console.error('❌ Ошибка создания ИУП при назначении руководителя:', iupError);
            // Не прерываем обновление пользователя
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Пользователь успешно обновлен',
      data: { user: updatedUser }
    });

  } catch (error) {
    console.error('Update user error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Ошибка валидации',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Ошибка обновления пользователя'
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Удалить пользователя (мягкое удаление)
// @access  Private (Admins only)
router.delete('/:id', authorize('admins'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Нельзя удалить самого себя
    if (req.user._id.toString() === user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Нельзя удалить самого себя'
      });
    }

    // Мягкое удаление - помечаем как неактивного
    user.isActive = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Пользователь успешно деактивирован'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка удаления пользователя'
    });
  }
});

// @route   POST /api/users/:id/restore
// @desc    Восстановить пользователя
// @access  Private (Admins only)
router.post('/:id/restore', authorize('admins'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    user.isActive = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Пользователь успешно восстановлен',
      data: { user }
    });

  } catch (error) {
    console.error('Restore user error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка восстановления пользователя'
    });
  }
});

// @route   GET /api/users/stats/dashboard
// @desc    Получить статистику для дашборда админа
// @access  Private (Admins only)
router.get('/stats/dashboard', authorize('admins'), async (req, res) => {
  try {
    const stats = await Promise.all([
      User.countDocuments({ role: 'magistrants', isActive: true }),
      User.countDocuments({ role: 'doctorants', isActive: true }),
      User.countDocuments({ role: 'leaders', isActive: true }),
      User.countDocuments({ role: 'admins', isActive: true }),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false })
    ]);

    const [magistrants, doctorants, leaders, admins, active, inactive] = stats;

    res.status(200).json({
      success: true,
      data: {
        byRole: {
          magistrants,
          doctorants,
          leaders,
          admins
        },
        totals: {
          active,
          inactive,
          total: active + inactive
        }
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения статистики'
    });
  }
});

export default router;
