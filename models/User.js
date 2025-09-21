import mongoose from 'mongoose';
import validator from 'validator';
import bcryptjs from 'bcryptjs';

const userSchema = new mongoose.Schema({
  lastname: {
    type: String,
    required: [true, 'Фамилия обязательна'],
    trim: true,
    maxlength: [50, 'Фамилия не может быть длиннее 50 символов']
  },
  firstname: {
    type: String,
    required: [true, 'Имя обязательно'],
    trim: true,
    maxlength: [50, 'Имя не может быть длиннее 50 символов']
  },
  fathername: {
    type: String,
    trim: true,
    maxlength: [50, 'Отчество не может быть длиннее 50 символов'],
    default: ''
  },
  role: {
    type: String,
    required: [true, 'Роль обязательна'],
    enum: {
      values: ['magistrants', 'doctorants', 'leaders', 'admins'],
      message: 'Роль должна быть одной из: magistrants, doctorants, leaders, admins'
    }
  },
  whatsapp: {
    type: String,
    required: [true, 'WhatsApp номер обязателен'],
    validate: {
      validator: function(v) {
        // Проверяем, что это валидный номер телефона (может начинаться с +)
        return /^\+?[1-9]\d{1,14}$/.test(v.replace(/\s/g, ''));
      },
      message: 'Некорректный номер WhatsApp'
    }
  },
  email: {
    type: String,
    required: [true, 'Email обязателен'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return validator.isEmail(v);
      },
      message: 'Некорректный email адрес'
    }
  },
  degree: {
    type: [String],
    validate: {
      validator: function(v) {
        // Проверяем, что все элементы массива являются валидными кодами степеней
        const validDegrees = [
          'phd_assoc_prof', 'candidate_prof', 'assoc_prof', 
          'phd', 'candidate', 'professor', 'doctor'
        ];
        return !v || v.every(degree => validDegrees.includes(degree));
      },
      message: 'Некорректный код степени'
    },
    required: function() {
      return this.role === 'leaders';
    }
  },
  OP: {
    type: String,
    required: function() {
      return ['magistrants', 'doctorants'].includes(this.role);
    },
    enum: {
      values: ['7M01503', '7M06101', '7M06104', '8D01103'],
      message: 'OP должна быть одной из доступных образовательных программ'
    }
  },
  language: {
    type: String,
    required: [true, 'Язык обучения обязателен'],
    enum: {
      values: ['Қазақша', 'Русский'],
      message: 'Язык должен быть: Қазақша или Русский'
    }
  },
  // Дополнительные поля для системы
  username: {
    type: String,
    unique: true,
    sparse: true, // Позволяет null/undefined значения быть уникальными
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      return this.role === 'admins';
    },
    minlength: [6, 'Пароль должен быть не менее 6 символов']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.role !== 'admins';
    }
  },
  // Поле для магистрантов/докторантов - ссылка на руководителя
  supervisor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    validate: {
      validator: function(v) {
        // supervisor может быть установлен только для магистрантов и докторантов
        if (v && !['magistrants', 'doctorants'].includes(this.role)) {
          return false;
        }
        return true;
      },
      message: 'Руководитель может быть назначен только магистрантам и докторантам'
    }
  },
  // Поле для руководителей - массив ссылок на подопечных
  supervisees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    validate: {
      validator: function(v) {
        // supervisees может быть установлен только для руководителей
        if (v && v.length > 0 && this.role !== 'leaders') {
          return false;
        }
        return true;
      },
      message: 'Подопечные могут быть назначены только руководителям'
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Виртуальное поле для полного имени
userSchema.virtual('fullName').get(function() {
  const parts = [this.lastname, this.firstname];
  if (this.fathername) {
    parts.push(this.fathername);
  }
  return parts.join(' ');
});

// Индексы для оптимизации поиска
userSchema.index({ role: 1 });
userSchema.index({ lastname: 1, firstname: 1 });
userSchema.index({ username: 1 });
userSchema.index({ isActive: 1 });

// Pre-save middleware для генерации username и хэширования пароля
userSchema.pre('save', async function(next) {
  // Генерируем username если его нет
  if (!this.username && this.isNew) {
    const baseUsername = `${this.firstname.toLowerCase()}.${this.lastname.toLowerCase()}`;
    let username = baseUsername;
    let counter = 1;
    
    // Проверяем уникальность username
    while (await mongoose.models.User.findOne({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }
    
    this.username = username;
  }

  // Хэшируем пароль для админов, если он был изменен
  if (this.password && (this.isModified('password') || this.isNew)) {
    this.password = await bcryptjs.hash(this.password, 12);
  }
  
  next();
});

// Статический метод для синхронизации связей
userSchema.statics.syncSupervisorLinks = async function(userId) {
  try {
    const user = await this.findById(userId);
    if (!user) return;
    
    // Если это руководитель с подопечными
    if (user.role === 'leaders' && user.supervisees && user.supervisees.length > 0) {
      // Устанавливаем supervisor у всех подопечных
      await this.updateMany(
        { _id: { $in: user.supervisees } },
        { supervisor: user._id }
      );
      console.log(`Синхронизированы связи для руководителя ${user.fullName}`);
    }
    
    // Если это студент с руководителем
    if (['magistrants', 'doctorants'].includes(user.role) && user.supervisor) {
      // Добавляем студента в список подопечных руководителя
      await this.findByIdAndUpdate(
        user.supervisor,
        { $addToSet: { supervisees: user._id } }
      );
      console.log(`Добавлен студент ${user.fullName} к руководителю`);
    }
  } catch (error) {
    console.error('Ошибка синхронизации связей:', error);
  }
};

// Метод для проверки пароля
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcryptjs.compare(candidatePassword, this.password);
};

// Статический метод для создания админа по умолчанию
userSchema.statics.createDefaultAdmin = async function() {
  const adminExists = await this.findOne({ role: 'admins' });
  
  if (!adminExists) {
    const defaultAdmin = new this({
      lastname: 'Администратор',
      firstname: 'Системный',
      fathername: '',
      role: 'admins',
      whatsapp: '+77000000000',
      email: 'admin@docmaster.kz',
      language: 'Русский',
      username: 'admin',
      password: 'admin123', // Пароль для админа по умолчанию
      isActive: true
    });
    
    await defaultAdmin.save();
    console.log('✅ Создан администратор по умолчанию (username: admin, password: admin123)');
    return defaultAdmin;
  }
  
  return adminExists;
};

// Методы для получения пользователей по ролям
userSchema.statics.getByRole = function(role) {
  return this.find({ role, isActive: true }).sort({ lastname: 1, firstname: 1 });
};

userSchema.statics.getAllActiveUsers = function() {
  return this.find({ isActive: true }).sort({ role: 1, lastname: 1, firstname: 1 });
};

const User = mongoose.model('User', userSchema);

export default User;
