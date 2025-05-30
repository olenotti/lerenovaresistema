import React, { useState } from 'react';
import './App.css';
import SideMenu from './components/SideMenu';
import ClientManager from './components/ClientManager';
import PackageManager from './components/PackageManager';
import Agendamentos from './components/Agendamentos';
import ClienteConsultaView from './components/ClienteConsultaView';
import HorariosFixos from './components/HorariosFixos';
import ControleAtendimentosView from './components/ControleAtendimentosView';
import AgendaVisual from './components/AgendaVisual'; // Importar AgendaVisual

// A inicialização do Supabase client deve estar centralizada em supabaseClient.js
// e importada nos componentes que a utilizam.

function App() {
  const [selectedMenu, setSelectedMenu] = useState(2); // Agendamentos como padrão ao iniciar

  const renderContent = () => {
    switch (selectedMenu) {
      case 0:
        return <ClientManager />;
      case 1:
        return <PackageManager />;
      case 2:
        return <Agendamentos />;
      case 3:
        return <ClienteConsultaView />;
      case 4:
        return <HorariosFixos />;
      case 5:
        return <ControleAtendimentosView />;
      case 6:
        return <AgendaVisual />; // Utilizar o componente AgendaVisual
      default:
        return <div>Selecione uma opção no menu</div>;
    }
  };

  return (
    <div className="App">
      <SideMenu menu={selectedMenu} setMenu={setSelectedMenu} />
      <main className="App-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;