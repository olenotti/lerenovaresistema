import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import SideMenu from './components/SideMenu';
import ClientManager from './components/ClientManager';
import PackageManager from './components/PackageManager';
import Agendamentos from './components/Agendamentos';
import ClienteConsultaView from './components/ClienteConsultaView';
import HorariosFixos from './components/HorariosFixos';
import ControleAtendimentosView from './components/ControleAtendimentosView';
import AgendaVisual from './components/AgendaVisual';
import Login from './components/Login';
import { supabase } from './supabaseClient';

import { Box, CssBaseline, useMediaQuery, CircularProgress } from '@mui/material';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#00695f', 
      light: '#338a7e', 
      dark: '#004a42',  
    },
    secondary: {
      main: '#f57c00', 
    },
    background: {
      default: '#f4f6f8', 
      paper: '#ffffff',    
    },
    warning: { 
      light: '#ffb74d', 
      main: '#ffa726',
      dark: '#f57c00', 
    },
    error: { 
        main: '#d32f2f',
    }
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
    h5: {
      fontWeight: 700,
    },
    button: {
      textTransform: 'none', 
    }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12, 
        },
      },
    },
     MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#ffffff', 
          borderRadius: 0, 
        }
      }
    },
    MuiListItemText: {
      styleOverrides: {
        primary: {
          // fontWeight: 500,
        }
      }
    },
    MuiAppBar: {
        styleOverrides: {
            colorPrimary: {
                backgroundColor: '#ffffff', 
                color: '#000000', 
            }
        }
    }
  },
});

const DRAWER_WIDTH = 240;

const getCurrentDayMonth = () => {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${dd}-${mm}`;
};

function App() {
  const [selectedMenu, setSelectedMenu] = useState(6); 
  const [mobileOpen, setMobileOpen] = useState(false);
  const muiThemeHook = useTheme(); 
  const isMobile = useMediaQuery(muiThemeHook.breakpoints.down('md'));

  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const fetchClientsForApp = useCallback(async () => {
    if (!supabase || !session) return;
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email, phone, birthday, notes, client_packages (id, package_id, package_name, start_date, validity_date, sessions_used, total_sessions, status, packages (id, name, total_sessions, session_duration_text))')
        .order('name', { ascending: true });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Erro ao buscar clientes em App.js:', error.message);
      setClients([]);
    } finally {
      setLoadingClients(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      fetchClientsForApp();
    } else {
      setClients([]);
    }
  }, [session, fetchClientsForApp]);

  const aniversariantesDoDiaApp = useMemo(() => {
    if (!clients || clients.length === 0) return [];
    const hojeDDMM = getCurrentDayMonth();
    return clients.filter(c => c && c.birthday === hojeDDMM);
  }, [clients]);

  useEffect(() => {
    setLoadingAuth(true);
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (_event === 'SIGNED_IN' && newSession) {
        setSelectedMenu(6); 
      }
      if (_event === 'SIGNED_OUT') {
        setClients([]); 
        setSelectedMenu(6); 
      }
      if (_event === 'INITIAL_SESSION' || _event === 'SIGNED_IN' || _event === 'SIGNED_OUT') {
        setLoadingAuth(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  useEffect(() => {
    if (!isMobile && mobileOpen) {
      setMobileOpen(false);
    }
  }, [isMobile, mobileOpen]);

  const handleLogout = async () => {
    setLoadingAuth(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
    }
  };

  if (loadingAuth && !session) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: 'background.default' }}>
          <CircularProgress />
        </Box>
      </ThemeProvider>
    );
  }

  const renderMainContent = () => {
    if (!session) {
      return <Login />;
    }
    switch (selectedMenu) {
      case 0:
        return <ClientManager clientsProp={clients} fetchClientsProp={fetchClientsForApp} loadingClientsProp={loadingClients} />;
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
      default:
        return <AgendaVisual />;
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        {session && (
          <SideMenu
            menu={selectedMenu}
            setMenu={setSelectedMenu}
            isMobile={isMobile}
            mobileOpen={mobileOpen}
            handleDrawerToggle={handleDrawerToggle}
            drawerWidth={DRAWER_WIDTH}
            onLogout={handleLogout}
            aniversariantesCount={aniversariantesDoDiaApp.length}
          />
        )}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: session ? 4 : 0, // Alterado de 1 para 2 (ou o valor que preferir)
            width: isMobile ? '100%' : undefined,
            ml: isMobile ? 0 : undefined,
            mt: 0, 
            bgcolor: session ? 'background.default' : 'transparent', 
            minHeight: '100vh', 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
          }}
        >
          {renderMainContent()}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;