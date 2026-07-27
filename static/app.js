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
const position = document.querySelector('#lightbox-position');
const previousButton = document.querySelector('#lightbox-previous');
const nextButton = document.querySelector('#lightbox-next');
const frames = [...document.querySelectorAll('.image-frame')];
let currentImageIndex = 0;
let touchStartX = null;
let touchStartY = null;

function isLightboxOpen() {
  return dialog.hasAttribute('open');
}

function openLightbox() {
  // Older browsers expose <dialog> without implementing the modal methods.
  // Keeping an attribute-based fallback prevents an image click from throwing
  // and leaving the viewer blank.
  if (typeof dialog.showModal === 'function') {
    if (!isLightboxOpen()) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
    dialog.setAttribute('aria-modal', 'true');
  }
}

function closeLightbox() {
  if (typeof dialog.close === 'function') {
    if (isLightboxOpen()) dialog.close();
  } else {
    dialog.removeAttribute('open');
    dialog.removeAttribute('aria-modal');
  }
}

function preloadImage(index) {
  if (index < 0 || index >= frames.length) return;
  const image = new Image();
  image.src = frames[index].dataset.full;
}

function showImage(index) {
  if (!frames.length) return;

  currentImageIndex = (index + frames.length) % frames.length;
  const frame = frames[currentImageIndex];

  dialogImage.src = frame.dataset.full;
  dialogImage.alt = frame.dataset.alt;
  caption.textContent = frame.dataset.title;
  position.textContent = `${currentImageIndex + 1} of ${frames.length}`;
  previousButton.disabled = frames.length < 2;
  nextButton.disabled = frames.length < 2;

  preloadImage((currentImageIndex + 1) % frames.length);
  preloadImage((currentImageIndex - 1 + frames.length) % frames.length);
}

function showPreviousImage() {
  showImage(currentImageIndex - 1);
}

function showNextImage() {
  showImage(currentImageIndex + 1);
}

frames.forEach((frame, index) => frame.addEventListener('click', () => {
  showImage(index);
  openLightbox();
}));

previousButton.addEventListener('click', showPreviousImage);
nextButton.addEventListener('click', showNextImage);
dialog.querySelector('.close').addEventListener('click', closeLightbox);

dialog.addEventListener('click', event => {
  if (event.target === dialog) closeLightbox();
});

dialog.addEventListener('touchstart', event => {
  touchStartX = event.changedTouches[0].clientX;
  touchStartY = event.changedTouches[0].clientY;
}, { passive: true });

dialog.addEventListener('touchend', event => {
  if (touchStartX === null || touchStartY === null) return;

  const horizontalDistance = event.changedTouches[0].clientX - touchStartX;
  const verticalDistance = event.changedTouches[0].clientY - touchStartY;
  touchStartX = null;
  touchStartY = null;

  if (Math.abs(horizontalDistance) < 50 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance)) return;
  if (horizontalDistance > 0) showPreviousImage();
  else showNextImage();
}, { passive: true });

document.addEventListener('keydown', event => {
  if (!isLightboxOpen()) return;

  if (event.key === 'Escape') closeLightbox();
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    showPreviousImage();
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    showNextImage();
  }
});
