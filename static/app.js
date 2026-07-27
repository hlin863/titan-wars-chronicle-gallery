const pills = [...document.querySelectorAll('.year-pill')];
const chapters = [...document.querySelectorAll('.chapter')];
const search = document.querySelector('#search');
const empty = document.querySelector('#empty');
let selectedYear = 'all';

function applyFilters() {
  const query = search.value.trim().toLowerCase();
  let shown = 0;
  chapters.forEach(chapter => {
    const yearMatch = selectedYear === 'all' || chapter.dataset.year === selectedYear;
    const textMatch = !query || chapter.dataset.search.includes(query);
    const visible = yearMatch && textMatch;
    chapter.hidden = !visible;
    if (visible) shown += 1;
  });
  empty.hidden = shown !== 0;
}

pills.forEach(pill => pill.addEventListener('click', () => {
  selectedYear = pill.dataset.year;
  pills.forEach(item => item.classList.toggle('active', item === pill));
  applyFilters();
}));
search.addEventListener('input', applyFilters);

const dialog = document.querySelector('#lightbox');
const dialogImage = document.querySelector('#lightbox-image');
const caption = document.querySelector('#lightbox-caption');
document.querySelectorAll('.image-frame').forEach(frame => frame.addEventListener('click', () => {
  dialogImage.src = frame.dataset.full;
  dialogImage.alt = frame.dataset.alt;
  caption.textContent = frame.dataset.title;
  dialog.showModal();
}));
dialog.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && dialog.open) dialog.close(); });
