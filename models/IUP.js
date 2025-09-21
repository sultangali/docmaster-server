import mongoose from 'mongoose';

// Модель для отдельного этапа ИУП
const stageSchema = new mongoose.Schema({
  stageNumber: {
    type: Number,
    required: true,
    min: 1
  },
  stageType: {
    type: String,
    required: true,
    enum: ['dissertation_topic', 'dissertation_application'],
    default: 'dissertation_topic'
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  // Данные, которые должен заполнить магистрант
  studentData: {
    // Для первого этапа - темы на 3 языках
    dissertationTopic: {
      kazakh: {
        type: String,
        trim: true
      },
      russian: {
        type: String,
        trim: true
      },
      english: {
        type: String,
        trim: true
      }
    },
    // Универсальное поле для текстовых данных других этапов
    textData: {
      type: String,
      trim: true
    },
    // Поле для загруженных файлов
    files: [{
      fileName: String,
      filePath: String,
      fileSize: Number,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    // Дополнительные поля для различных типов данных
    additionalData: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  // Правки и комментарии от руководителя
  supervisorEdits: {
    dissertationTopic: {
      kazakh: {
        type: String,
        trim: true
      },
      russian: {
        type: String,
        trim: true
      },
      english: {
        type: String,
        trim: true
      }
    },
    textData: {
      type: String,
      trim: true
    },
    comments: {
      type: String,
      trim: true
    },
    editedAt: {
      type: Date
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  // Статус этапа
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'submitted', 'supervisor_review', 'supervisor_approved', 'admin_review', 'admin_approved', 'completed', 'rejected'],
    default: 'not_started'
  },
  // История изменений статуса
  statusHistory: [{
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'submitted', 'supervisor_review', 'supervisor_approved', 'admin_review', 'admin_approved', 'completed', 'rejected']
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    comment: {
      type: String
    }
  }],
  // Даты
  submittedAt: {
    type: Date
  },
  supervisorReviewedAt: {
    type: Date
  },
  adminReviewedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  // Требует ли этап одобрения руководителя
  requiresSupervisorApproval: {
    type: Boolean,
    default: true
  },
  // Требует ли этап одобрения админа
  requiresAdminApproval: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Основная модель ИУП
const iupSchema = new mongoose.Schema({
  // Год ИУП
  year: {
    type: Number,
    required: true,
    default: () => new Date().getFullYear()
  },
  // Магистрант, которому принадлежит ИУП
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Руководитель
  supervisor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Общий статус ИУП
  overallStatus: {
    type: String,
    enum: ['draft', 'in_progress', 'supervisor_review', 'admin_review', 'completed', 'approved'],
    default: 'draft'
  },
  // Текущий активный этап
  currentStage: {
    type: Number,
    default: 1,
    min: 1
  },
  // Этапы ИУП
  stages: [stageSchema],
  // Метаданные
  metadata: {
    totalStages: {
      type: Number,
      default: 2 // Может быть настроено для разных программ
    },
    educationProgram: {
      type: String,
      enum: ['7M01503', '7M06101', '7M06104', '8D01103'],
      required: true
    },
    language: {
      type: String,
      enum: ['Қазақша', 'Русский'],
      required: true
    }
  },
  // Флаг активности
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Виртуальное поле для прогресса
iupSchema.virtual('progress').get(function() {
  if (!this.stages || this.stages.length === 0) return 0;
  
  const completedStages = this.stages.filter(stage => 
    ['completed', 'admin_approved'].includes(stage.status)
  ).length;
  
  return Math.round((completedStages / this.metadata.totalStages) * 100);
});

// Виртуальное поле для получения текущего этапа
iupSchema.virtual('currentStageData').get(function() {
  if (!this.stages || this.stages.length === 0) return null;
  return this.stages.find(stage => stage.stageNumber === this.currentStage);
});

// Индексы для оптимизации
iupSchema.index({ student: 1, year: 1 }, { unique: true });
iupSchema.index({ supervisor: 1 });
iupSchema.index({ year: 1 });
iupSchema.index({ overallStatus: 1 });
iupSchema.index({ 'metadata.educationProgram': 1 });
iupSchema.index({ isActive: 1 });

// Статический метод для создания ИУП с базовыми этапами
iupSchema.statics.createWithDefaultStages = async function(studentId, supervisorId, educationProgram, language) {
  // Базовые этапы для всех программ
  const defaultStages = [
    {
      stageNumber: 1,
      stageType: 'dissertation_topic',
      title: 'Тема диссертационной работы',
      description: 'Выбор и формулировка темы диссертационной работы на трех языках',
      requiresSupervisorApproval: true,
      requiresAdminApproval: true
    },
    {
      stageNumber: 2,
      stageType: 'dissertation_application',
      title: 'Заявление на тему диссертации',
      description: 'Подача официального заявления на утверждение темы диссертационной работы',
      requiresSupervisorApproval: true,
      requiresAdminApproval: true
    }
  ];

  const iup = new this({
    student: studentId,
    supervisor: supervisorId,
    stages: defaultStages,
    metadata: {
      totalStages: defaultStages.length,
      educationProgram,
      language
    }
  });

  try {
    return await iup.save();
  } catch (error) {
    // Если ошибка дублирования (E11000), возвращаем существующий ИУП
    if (error.code === 11000) {
      console.log('ИУП уже существует, возвращаем существующий...');
      const existingIUP = await this.findOne({
        student: studentId,
        year: new Date().getFullYear(),
        isActive: true
      });
      if (existingIUP) {
        return existingIUP;
      }
    }
    // Для других ошибок пробрасываем исключение
    throw error;
  }
};

// Метод для обновления статуса этапа
iupSchema.methods.updateStageStatus = function(stageNumber, newStatus, userId, comment = '') {
  const stage = this.stages.find(s => s.stageNumber === stageNumber);
  if (!stage) {
    throw new Error('Этап не найден');
  }

  // Добавляем запись в историю
  stage.statusHistory.push({
    status: newStatus,
    changedBy: userId,
    changedAt: new Date(),
    comment
  });

  // Обновляем статус
  stage.status = newStatus;

  // Обновляем соответствующие даты
  switch (newStatus) {
    case 'submitted':
      stage.submittedAt = new Date();
      break;
    case 'supervisor_approved':
      stage.supervisorReviewedAt = new Date();
      break;
    case 'admin_review':
      // Статус установлен для проверки админом, дата проверки пока не устанавливается
      break;
    case 'admin_approved':
    case 'completed':
      stage.completedAt = new Date();
      if (newStatus === 'admin_approved') {
        stage.adminReviewedAt = new Date();
      }
      break;
  }

  return this.save();
};

// Метод для перехода к следующему этапу
iupSchema.methods.moveToNextStage = function() {
  if (this.currentStage < this.metadata.totalStages) {
    this.currentStage += 1;
    
    // Активируем следующий этап
    const nextStage = this.stages.find(s => s.stageNumber === this.currentStage);
    if (nextStage && nextStage.status === 'not_started') {
      nextStage.status = 'in_progress';
    }
    
    return this.save();
  }
  return Promise.resolve(this);
};

// Метод для получения статистики по ИУП для админа
iupSchema.statics.getStatistics = async function(filters = {}) {
  const pipeline = [
    { $match: { isActive: true, ...filters } },
    {
      $lookup: {
        from: 'users',
        localField: 'student',
        foreignField: '_id',
        as: 'studentInfo'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'supervisor',
        foreignField: '_id',
        as: 'supervisorInfo'
      }
    },
    {
      $unwind: '$studentInfo'
    },
    {
      $unwind: { path: '$supervisorInfo', preserveNullAndEmptyArrays: true }
    },
    {
      $group: {
        _id: '$overallStatus',
        count: { $sum: 1 },
        students: {
          $push: {
            _id: '$student',
            name: '$studentInfo.fullName',
            OP: '$studentInfo.OP',
            language: '$studentInfo.language',
            supervisor: '$supervisorInfo.fullName',
            currentStage: '$currentStage',
            progress: {
              $multiply: [
                { $divide: [
                  { $size: { $filter: {
                    input: '$stages',
                    cond: { $in: ['$$this.status', ['completed', 'admin_approved']] }
                  }}},
                  '$metadata.totalStages'
                ]},
                100
              ]
            }
          }
        }
      }
    }
  ];

  return await this.aggregate(pipeline);
};

const IUP = mongoose.model('IUP', iupSchema);

export default IUP;
