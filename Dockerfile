# Use the official Selenium standalone Chrome image as a parent image
FROM selenium/standalone-chrome

# Set environment variables to avoid creating .pyc files and to disable output buffering.
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set the working directory in the container.
WORKDIR /app

# Switch to the root user so we have the needed privileges.
USER root

# Ensure the partial directory exists and install system dependencies.
RUN mkdir -p /var/lib/apt/lists/partial && \
    apt-get update && \
    apt-get install -y python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

# Create a Python virtual environment.
RUN python3 -m venv /opt/venv

# Copy the requirements file and install Python dependencies in the virtual environment.
COPY requirements.txt /app/
RUN /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install selenium flask webdriver-manager requests

# Copy the rest of the application code into the container.
COPY . /opt/

# Expose port 5000 for Flask.
EXPOSE 5000


# Set the environment variable for Flask
ENV FLASK_APP=app.py

# Run the Flask application using the virtual environment's Python and module invocation of Flask.
CMD ["/opt/venv/bin/python", "-m", "flask", "run", "--host=0.0.0.0"]
