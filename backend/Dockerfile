# 官方 Python 3.12 镜像（CentOS7 兼容，自带高版本glibc）
FROM python:3.12-slim

# 安装 bcrypt 必须的编译依赖（CentOS7 Docker 内必备）
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list \
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# 工作目录
WORKDIR /app

# 复制依赖
COPY ./backend/requirements.txt .

RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 安装你要的三个库（强制固定版本，不飘）
RUN pip install --upgrade pip && \
    pip install python-multipart && \
    pip install passlib==1.7.4 && \
    pip install bcrypt==4.1.0 && \
    pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY ./backend /app

# 启动
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
