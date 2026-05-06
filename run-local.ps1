Write-Host "Inicia backend, frontend y agente en terminales separadas."
Write-Host "Backend:  cd backend;  pip install -r requirements.txt; copy .env.example .env; uvicorn app.main:app --reload"
Write-Host "Frontend: cd frontend; npm install; copy .env.example .env; npm run dev"
Write-Host "Agente:   cd agent;    pip install psutil requests; copy config.example.json config.json; python agent.py"
