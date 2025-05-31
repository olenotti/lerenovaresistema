import React, { useState, useEffect } from 'react';
import './App.css';
import SideMenu from './components/SideMenu';
import ClientManager from './components/ClientManager';
import PackageManager from './components/PackageManager';
import Agendamentos from './components/Agendamentos';
import ClienteConsultaView from './components/ClienteConsultaView';
import HorariosFixos from './components/HorariosFixos';
import ControleAtendimentosView from './components/ControleAtendimentosView';
import AgendaVisual from './components/AgendaVisual';
// import Configuracoes from './components/Configuracoes';
import Login from './components/Login'; // Import the Login component
import { supabase } from './supabaseClient'; // Ensure supabase is imported

import { Box, CssBaseline, IconButton, Toolbar, Typography, AppBar as MuiAppBar, useMediaQuery, Tooltip, CircularProgress, Button } from '@mui/material';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout'; // For logout button

// Seu tema existente ou um novo
const theme = createTheme({
  palette: {
    primary: {
      main: '#00695f', // Verde escuro Le Renovare
      // light: '#338a7e',
      // dark: '#004a42',
    },
    secondary: {
      main: '#f57c00', // Laranja para contraste ou ações secundárias
    },
    background: {
      default: '#f4f6f8', // Um cinza claro para o fundo
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
    h5: {
      fontWeight: 700,
    },
    button: {
      textTransform: 'none', // Botões com texto normal
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
          borderRadius: 12, // Bordas mais arredondadas para Paper
        },
      },
    },
     MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#004d40', // Verde bem escuro para o Drawer
          color: '#e0f2f1', // Texto claro no Drawer
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
                backgroundColor: '#004d40' // Verde bem escuro para AppBar também
            }
        }
    }
  },
});

const DRAWER_WIDTH = 240;

function App() {
  const [selectedMenu, setSelectedMenu] = useState(6); // AgendaVisual como padrão
  const [mobileOpen, setMobileOpen] = useState(false);
  const muiTheme = useTheme(); // Para usar dentro do App, já que ThemeProvider está aqui
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));

  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

   useEffect(() => {
    setLoadingAuth(true);
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (_event === 'SIGNED_IN' && newSession) {
        setSelectedMenu(6); // Volta para AgendaVisual ao logar
      }
      if (_event === 'SIGNED_OUT') {
        // Poderia limpar outros estados da aplicação aqui se necessário
        setSelectedMenu(6); // Reset menu on logout
      }
      // Se o usuário for detectado como não autenticado (ex: token expirado),
      // a UI irá para a tela de login automaticamente devido à lógica de renderização.
      if (!newSession && _event !== 'INITIAL_SESSION') { // INITIAL_SESSION já tratado pelo getSession
          setLoadingAuth(false); // Garante que o loading para se a sessão se tornar nula
      }
    });

    return () => {
      subscription?.unsubscribe(); // Corrigido aqui
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
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
      // TODO: Show snackbar for logout error
    }
    // onAuthStateChange vai atualizar a 'session' para null, redirecionando para Login.
  };

  const renderContent = () => {
    switch (selectedMenu) {
      case 0: return <ClientManager />;
      case 1: return <PackageManager />;
      case 2: return <Agendamentos />;
      case 3: return <ClienteConsultaView />;
      case 4: return <HorariosFixos />;
      case 5: return <ControleAtendimentosView />;
      case 6: return <AgendaVisual />;
      // case 7: return <Configuracoes />;
      default: return <AgendaVisual />;
    }
  };

  if (loadingAuth) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: 'background.default' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Envolve toda a aplicação com ThemeProvider
  // Se não houver sessão, renderiza a tela de Login
  if (!session) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Login />
      </ThemeProvider>
    );
  }

  // Se houver sessão, renderiza a aplicação principal
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex' }}>
        {isMobile && (
          <MuiAppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar>
              <IconButton
                color="inherit"
                aria-label="open drawer"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ mr: 2 }}
              >
                <MenuIcon />
              </IconButton>
              <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
                Le Renovare
              </Typography>
              <Tooltip title="Sair">
                <IconButton color="inherit" onClick={handleLogout}>
                  <LogoutIcon />
                </IconButton>
              </Tooltip>
            </Toolbar>
          </MuiAppBar>
        )}
        <SideMenu
          menu={selectedMenu}
          setMenu={setSelectedMenu}
          isMobile={isMobile}
          mobileOpen={mobileOpen}
          handleDrawerToggle={handleDrawerToggle}
          drawerWidth={DRAWER_WIDTH}
          onLogout={handleLogout} // Passa a função de logout para o SideMenu
        />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 1, sm: 2, md: 3 }, // Padding responsivo
            width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
            ml: { md: `${DRAWER_WIDTH}px` },
            mt: { xs: '56px', sm: '64px', md: 0 }, // Ajuste para altura do AppBar
            bgcolor: 'background.default',
            minHeight: '100vh'
          }}
        >
          {/* Adiciona Toolbar no desktop para consistência de espaçamento e possível título/ações */}
          {!isMobile && (
            <Toolbar sx={{ displayPrint: 'none' }}>
                {/* Você pode adicionar o título da página atual aqui se desejar */}
                {/* <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>{menuItems.find(item => item.idx === selectedMenu)?.label || "Le Renovare"}</Typography> */}
            </Toolbar>
          )}
          {/* {isMobile && <Toolbar />}  // Espaçador para AppBar, já tratado pelo mt no Box principal */}
          {renderContent()}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
