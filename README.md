# DocMaster Server

Backend сервер для системы управления документооборотом докторантов и магистрантов.

## Технологии

- **Node.js** с **Express.js**
- **MongoDB** с **Mongoose**
- **JWT** для аутентификации
- **ES6 модули**

## Установка и запуск

### 1. Установка зависимостей

```bash
cd server
npm install
```

### 2. Настройка окружения

Создайте файл `.env` в корне папки server:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/docmaster
JWT_SECRET=docmaster_super_secret_key_2025
JWT_EXPIRES_IN=24h
NODE_ENV=development
SHARED_PASSWORD=docmaster2025
```

### 3. Запуск MongoDB

Убедитесь, что MongoDB запущен на вашем компьютере:

```bash
# На Ubuntu/Debian
sudo systemctl start mongod

# На macOS с Homebrew
brew services start mongodb/brew/mongodb-community

# Или запустите MongoDB в Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### 4. Инициализация базы данных

Запустите скрипт для создания тестовых данных:

```bash
npm run seed
```

Этот скрипт создаст:
- Администратора по умолчанию (username: `admin`)
- Тестовых пользователей разных ролей

### 5. Запуск сервера

```bash
# Для разработки (с автоперезагрузкой)
npm run dev

# Для продакшена
npm start
```

Сервер будет доступен по адресу: `http://localhost:5000`

## API Endpoints

### Аутентификация

- `POST /api/auth/login` - Авторизация пользователя
- `GET /api/auth/users` - Получить список пользователей для выбора при логине
- `GET /api/auth/me` - Получить информацию о текущем пользователе
- `POST /api/auth/refresh` - Обновить токен

### Управление пользователями

- `GET /api/users` - Получить список пользователей
- `GET /api/users/:id` - Получить пользователя по ID
- `POST /api/users` - Создать нового пользователя (только админы)
- `PUT /api/users/:id` - Обновить пользователя
- `DELETE /api/users/:id` - Деактивировать пользователя (только админы)
- `POST /api/users/:id/restore` - Восстановить пользователя (только админы)
- `GET /api/users/by-role/:role` - Получить пользователей по роли (только админы)
- `GET /api/users/stats/dashboard` - Статистика для дашборда (только админы)

### Health Check

- `GET /api/health` - Проверка состояния сервера

## Модель пользователя

```javascript
{
  lastname: String,        // Фамилия (обязательно)
  firstname: String,       // Имя (обязательно)  
  fathername: String,      // Отчество (опционально)
  role: String,           // Роль: magistrants, doctorants, leaders, admins
  whatsapp: String,       // WhatsApp номер (обязательно)
  degree: String,         // Степень (для leaders): bachelor, master, phd, professor
  OP: String,            // Образовательная программа (для студентов)
  language: String,       // Язык обучения: Қазақша, Русский
  username: String,       // Автогенерируемый username
  isActive: Boolean,      // Активность пользователя
  lastLogin: Date,        // Последний вход
  createdBy: ObjectId     // Кто создал пользователя
}
```

## Логика авторизации

1. **Система паролей**:
   - **Админы**: Индивидуальный пароль для каждого администратора
   - **Остальные роли**: Единый общий пароль для магистрантов, докторантов и руководителей
2. **Выбор пользователя**: На фронтенде пользователь выбирает себя из списка
3. **Роли и права**:
   - **admins**: Полный доступ, могут управлять всеми пользователями, используют индивидуальный пароль
   - **magistrants**: Доступ к своему профилю и функциям магистрантов, используют общий пароль
   - **doctorants**: Доступ к своему профилю и функциям докторантов, используют общий пароль
   - **leaders**: Доступ к своему профилю и функциям руководителей, используют общий пароль

## Скрипты

- `npm start` - Запуск сервера
- `npm run dev` - Запуск в режиме разработки
- `npm run seed` - Инициализация базы данных

## Структура проекта

```
server/
├── config/
│   └── database.js         # Подключение к MongoDB
├── middleware/
│   ├── auth.js            # Аутентификация и авторизация
│   └── errorHandler.js    # Обработка ошибок
├── models/
│   └── User.js            # Модель пользователя
├── routes/
│   ├── auth.js            # Роуты аутентификации
│   └── users.js           # Роуты управления пользователями
├── scripts/
│   └── seed.js            # Скрипт инициализации БД
├── .env                   # Переменные окружения
├── .gitignore
├── index.js               # Главный файл сервера
├── package.json
└── README.md
```

## Переменные окружения

- `PORT` - Порт сервера (по умолчанию: 5000)
- `MONGODB_URI` - URI подключения к MongoDB
- `JWT_SECRET` - Секретный ключ для JWT токенов
- `JWT_EXPIRES_IN` - Время жизни JWT токенов
- `NODE_ENV` - Окружение (development/production)
- `SHARED_PASSWORD` - Общий пароль для магистрантов, докторантов и руководителей
